/**
 * Telegram updates worker — long-polling getUpdates loop.
 *
 * Обрабатывает только callback_query с prefix "funnel:" и шлёт application
 * в clon2.candidates (см. services/funnel.js). Остальные апдейты игнорирует —
 * этот бот не интерактивный, у него нет команд /start.
 *
 * Внимание: если у бота настроен webhook (deleteWebhook не делался) —
 * getUpdates вернёт 409 Conflict. В этом случае worker логирует ошибку,
 * единоразово пытается deleteWebhook и перезапускается.
 *
 * Whitelist: только пользователи из config.api.allowedUserIds могут жать кнопку.
 */

import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { pushApplicationToFunnel } from '../services/funnel.js';

const TG_API = `https://api.telegram.org/bot${config.telegram.token}`;
const POLL_TIMEOUT_SEC = 25; // long-polling таймаут

let offset = 0;
let running = false;
let webhookCleanupAttempted = false;

async function answerCallback(callbackId, text, showAlert = false) {
  try {
    await axios.post(`${TG_API}/answerCallbackQuery`, {
      callback_query_id: callbackId,
      text: text.slice(0, 200), // лимит Telegram
      show_alert: showAlert,
    });
  } catch (err) {
    logger.warn(`answerCallback failed: ${err.message}`);
  }
}

async function editMessageReplyMarkup(chatId, messageId, replyMarkup) {
  try {
    await axios.post(`${TG_API}/editMessageReplyMarkup`, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: replyMarkup,
    });
  } catch (err) {
    // Часто «message can't be edited» (старые сообщения) — это ОК
    logger.debug(`editMessageReplyMarkup: ${err.response?.data?.description || err.message}`);
  }
}

async function handleFunnelCallback(cb) {
  const callbackId = cb.id;
  const userId = cb.from?.id;
  const data = cb.data || '';

  // Whitelist (берём из того же allowedUserIds что и mini-app API)
  if (config.api.allowedUserIds.length > 0 && !config.api.allowedUserIds.includes(userId)) {
    await answerCallback(callbackId, '🔒 У тебя нет доступа к этой кнопке.', true);
    logger.warn(`funnel callback denied for user ${userId}`);
    return;
  }

  // Парсим callback_data: "funnel:<source>:<external_id>"
  const parts = data.split(':');
  if (parts.length < 3 || parts[0] !== 'funnel') {
    await answerCallback(callbackId, '⚠ Неверный формат данных кнопки.', true);
    return;
  }
  const source = parts[1];
  const externalId = parts.slice(2).join(':');

  // Push в clon2
  const result = await pushApplicationToFunnel(source, externalId);

  if (!result.ok) {
    if (result.state === 'not_configured') {
      await answerCallback(callbackId, '⚙ CLON2_SUPABASE_* не настроены на сервере.', true);
    } else if (result.state === 'application_not_found') {
      await answerCallback(callbackId, '❓ Отклик не найден в БД бота.', true);
    } else {
      await answerCallback(callbackId, `❌ Ошибка: ${result.message || 'internal_error'}`, true);
    }
    return;
  }

  if (result.state === 'already_in_funnel') {
    await answerCallback(callbackId, `ℹ️ ${result.message}`, true);
  } else {
    await answerCallback(callbackId, `✅ ${result.message}`, true);
  }

  // Заменяем кнопку «В воронку Острова» на «✅ В воронке» — disabled URL вариант не существует,
  // поэтому используем callback_data с no-op (нажатие = просто алерт).
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;
  const oldMarkup = cb.message?.reply_markup;
  if (chatId && messageId && oldMarkup?.inline_keyboard) {
    const newKb = oldMarkup.inline_keyboard.map(row =>
      row.map(btn =>
        btn.callback_data?.startsWith('funnel:')
          ? { text: '✅ В воронке Острова', callback_data: 'funnel_done' }
          : btn
      )
    );
    await editMessageReplyMarkup(chatId, messageId, { inline_keyboard: newKb });
  }
}

async function processUpdate(u) {
  if (u.callback_query) {
    const data = u.callback_query.data || '';
    if (data.startsWith('funnel:')) {
      await handleFunnelCallback(u.callback_query);
    } else if (data === 'funnel_done') {
      await answerCallback(u.callback_query.id, 'Уже в воронке Острова.', false);
    } else {
      // Неизвестный callback — отвечаем чтобы убрать «крутилку» в Telegram
      await answerCallback(u.callback_query.id, '', false);
    }
  }
}

async function pollOnce() {
  try {
    const res = await axios.get(`${TG_API}/getUpdates`, {
      params: {
        offset,
        timeout: POLL_TIMEOUT_SEC,
        allowed_updates: JSON.stringify(['callback_query']),
      },
      timeout: (POLL_TIMEOUT_SEC + 5) * 1000,
    });

    const updates = res.data?.result || [];
    for (const u of updates) {
      try {
        await processUpdate(u);
      } catch (err) {
        logger.error(`update ${u.update_id} processing error: ${err.message}`);
      }
      offset = u.update_id + 1;
    }
  } catch (err) {
    const data = err.response?.data;
    // 409 Conflict — значит установлен webhook. Пытаемся снять один раз.
    if (data?.error_code === 409 && !webhookCleanupAttempted) {
      webhookCleanupAttempted = true;
      logger.warn('getUpdates 409: webhook is active. Removing webhook...');
      try {
        await axios.post(`${TG_API}/deleteWebhook`, { drop_pending_updates: false });
        logger.info('Webhook deleted; will retry getUpdates.');
      } catch (e2) {
        logger.error(`deleteWebhook failed: ${e2.message}`);
      }
    } else {
      logger.error(`getUpdates failed: ${data?.description || err.message}`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

export async function startTelegramUpdatesWorker() {
  if (running) {
    logger.warn('telegram-updates worker already running');
    return;
  }
  running = true;
  logger.info('Telegram updates worker started (long-polling callback_query)');

  // Бесконечный loop
  (async () => {
    while (running) {
      await pollOnce();
    }
  })().catch(err => {
    logger.error(`telegram-updates loop crashed: ${err.message}`);
    running = false;
  });
}

export function stopTelegramUpdatesWorker() {
  running = false;
}
