import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { truncate } from '../utils/helpers.js';
import { getRanking, getUiState, setUiState } from './database.js';
import { isClon2Configured } from './clon2-supabase.js';

const PIN_STATE_KEY = 'telegram_pinned_ranking_message_id';

const TG_API = `https://api.telegram.org/bot${config.telegram.token}`;

/**
 * Строит URL для inline-кнопки «В Mini App».
 *
 * Приоритет — Direct Link Mini App: https://t.me/<bot>/<short>?startapp=<param>
 * Эта ссылка открывает Mini App ВНУТРИ Telegram (с initData), даже когда
 * нажата из канала, где web_app-кнопки запрещены API.
 *
 * Если bot_username или short_name не настроены — fallback на WEBAPP_URL
 * (legacy-режим, кнопка откроет внешний браузер без initData).
 *
 * @param {Object|null} app — application; null для общей кнопки в pinned-сообщении
 * @param {Object} opts
 * @param {string} opts.botUsername       — без @, например "trat_hr_bot"
 * @param {string} opts.miniAppShortName  — например "hr_app"
 * @param {string} opts.webappUrl         — fallback URL фронта (legacy)
 * @returns {string|null} URL для inline-button.url или null если ничего не настроено
 */
export function buildMiniAppLink(app, { botUsername, miniAppShortName, webappUrl } = {}) {
  // Direct Link приоритет
  if (botUsername && miniAppShortName) {
    const base = `https://t.me/${botUsername}/${miniAppShortName}`;
    if (!app) return base;
    // startapp принимает только [a-zA-Z0-9_], никаких / : ? &
    // → формат: candidate_<source>_<external_id>
    const safeSource = String(app.source || '').replace(/[^a-zA-Z0-9]/g, '');
    const safeId = String(app.external_id || '').replace(/[^a-zA-Z0-9]/g, '');
    const startapp = `candidate_${safeSource}_${safeId}`;
    return `${base}?startapp=${startapp}`;
  }
  // Legacy fallback на WEBAPP_URL
  if (webappUrl) {
    const base = webappUrl.replace(/\/$/, '');
    if (!app) return base;
    return `${base}/?candidate=${encodeURIComponent(`${app.source}/${app.external_id}`)}`;
  }
  return null;
}

/**
 * Формирует текст карточки отклика для Telegram.
 *
 * @param {Object}      app     — application
 * @param {Object|null} vacancy — D4: при наличии добавляет префикс
 *                                «[Вакансия: <telegram_label или title>]» в начало,
 *                                чтобы в одном канале не путаться между вакансиями.
 */
export function buildMessage(app, vacancy = null) {
  // D4: префикс с названием вакансии (один канал, разделение текстом)
  const vacancyTag = vacancy && (vacancy.telegram_label || vacancy.title)
    ? `[Вакансия: ${vacancy.telegram_label || vacancy.title}]\n`
    : '';

  const statusEmoji = app.qualified === true ? '✅' : app.qualified === null ? '🟡' : '❌';
  const statusText = app.qualified === true
    ? 'Новый отклик'
    : app.qualified === null
    ? `Отклик (нет данных: ${app.filter_reason})`
    : 'Отклик (не подходит)';

  const sourceLabel = app.source === 'habr' ? 'Хабр Карьера' : 'HeadHunter';

  const citizenshipLine = app.citizenship === 'RU'
    ? '🇷🇺 Россия'
    : app.citizenship === 'OTHER'
    ? `🌍 ${app.citizenship_raw || 'другая страна'}`
    : '🌍 гражданство не указано';

  const expLine = app.experience_years !== null
    ? `⏱ Опыт: ${app.experience_years} лет`
    : '⏱ Опыт: не указан';

  const coverLetter = app.cover_letter
    ? `\n\n📝 _${truncate(app.cover_letter, 300)}_`
    : '';

  return (
    `${vacancyTag}${statusEmoji} *${statusText} — ${sourceLabel}*\n\n` +
    `👤 ${app.candidate_name || 'Имя не указано'}\n` +
    `💼 ${app.position || '—'}\n` +
    `🏢 Вакансия: ${app.vacancy_title || '—'}\n` +
    `📍 ${app.location || 'локация не указана'} | ${citizenshipLine}\n` +
    `${expLine}` +
    coverLetter
  );
}

/**
 * Отправляет карточку отклика в Telegram-канал.
 * Пропускает ❌ отклики (qualified=false) — они только в БД.
 *
 * @param {Object}      app     — application
 * @param {Object|null} vacancy — D4: при наличии в карточке появляется префикс «[Вакансия: …]»
 */
export async function sendApplicationCard(app, vacancy = null) {
  if (app.qualified === false) {
    logger.debug(`Skipping TG send for filtered application: ${app.source}/${app.external_id}`);
    return;
  }

  const text = buildMessage(app, vacancy);
  const url = app.candidate_url || app.application_url;

  const payload = {
    chat_id: config.telegram.channelId,
    text,
    parse_mode: 'Markdown',
    disable_web_page_preview: true,
  };

  const buttons = [];
  if (url) {
    buttons.push({
      text: app.source === 'habr' ? 'Открыть на Хабре →' : 'Открыть на HH →',
      url,
    });
  }
  // Кнопка-ссылка на Mini App. Direct Link (t.me/<bot>/<short>) открывается
  // ВНУТРИ Telegram даже из канала; legacy WEBAPP_URL — внешним браузером.
  const miniAppUrl = buildMiniAppLink(app, {
    botUsername: config.telegram.botUsername,
    miniAppShortName: config.telegram.miniAppShortName,
    webappUrl: config.api.publicUrl,
  });
  if (miniAppUrl) {
    buttons.push({ text: '📱 В Mini App', url: miniAppUrl });
  }

  // Кнопка «В воронку Острова» — callback_query, обрабатывается в workers/telegram-updates.js.
  // callback_data ограничен 64 байтами, поэтому шлём только source+external_id.
  const funnelButton = isClon2Configured()
    ? { text: '➕ В воронку Острова', callback_data: `funnel:${app.source}:${String(app.external_id).slice(0, 50)}` }
    : null;

  // Раскладываем кнопки: первая строка — внешние ссылки, вторая — funnel (если есть)
  const rows = [];
  if (buttons.length) rows.push(buttons);
  if (funnelButton) rows.push([funnelButton]);
  if (rows.length) {
    payload.reply_markup = { inline_keyboard: rows };
  }

  try {
    await axios.post(`${TG_API}/sendMessage`, payload);
    logger.info(`TG sent: ${app.source}/${app.external_id}`);
  } catch (err) {
    const data = err.response?.data;
    // Telegram rate limit: подождать retry_after секунд и повторить один раз
    if (data?.error_code === 429 && data?.parameters?.retry_after) {
      const wait = (data.parameters.retry_after + 1) * 1000;
      logger.warn(`TG rate limit, waiting ${data.parameters.retry_after}s...`);
      await new Promise(r => setTimeout(r, wait));
      try {
        await axios.post(`${TG_API}/sendMessage`, payload);
        logger.info(`TG sent (retry): ${app.source}/${app.external_id}`);
      } catch (retryErr) {
        logger.error(`TG retry failed: ${retryErr.response?.data?.description || retryErr.message}`);
      }
    } else {
      logger.error(`TG sendMessage failed: ${JSON.stringify(data || err.message)}`);
    }
  }
}

/**
 * Отправляет AI-анализ резюме как отдельное сообщение после карточки.
 */
export async function sendAiAnalysis(app, analysisText) {
  if (!analysisText) return;

  try {
    await axios.post(`${TG_API}/sendMessage`, {
      chat_id: config.telegram.channelId,
      text: analysisText,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    });
    logger.info(`TG AI analysis sent: ${app.source}/${app.external_id}`);
  } catch (err) {
    const data = err.response?.data;
    if (data?.error_code === 429 && data?.parameters?.retry_after) {
      const wait = (data.parameters.retry_after + 1) * 1000;
      await new Promise(r => setTimeout(r, wait));
      try {
        await axios.post(`${TG_API}/sendMessage`, {
          chat_id: config.telegram.channelId,
          text: analysisText,
          parse_mode: 'Markdown',
        });
      } catch { /* тихо пропускаем */ }
    }
  }
}

/**
 * Отправляет служебное сообщение (алерты, ошибки)
 */
export async function sendAlert(text) {
  try {
    await axios.post(`${TG_API}/sendMessage`, {
      chat_id: config.telegram.channelId,
      text: `⚠️ *Алерт бота*\n\n${text}`,
      parse_mode: 'Markdown',
    });
  } catch (err) {
    logger.error(`TG alert failed: ${err.message}`);
  }
}

// ============================================================
// Pinned-сообщение с рейтингом кандидатов (сверху вниз)
// ============================================================

/** Экранирует проблемные символы для Markdown V1 (TG). */
function escMd(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/([_*`\[\]])/g, '\\$1');
}

function scoreEmoji(score) {
  if (score === null || score === undefined) return '⚪';
  if (score >= 9) return '🔥';
  if (score >= 8) return '⭐';
  if (score >= 7) return '👍';
  if (score >= 5) return '🟡';
  return '🔴';
}

function rankBadge(idx) {
  if (idx === 0) return '🥇';
  if (idx === 1) return '🥈';
  if (idx === 2) return '🥉';
  return `${idx + 1}.`;
}

/**
 * Формирует Markdown-текст рейтинга для Telegram.
 * @param {Array} candidates - отсортированный массив (см. getRanking)
 * @param {number} topN - сколько строк показать
 */
function buildRankingMessage(candidates, topN = 15) {
  const list = candidates.slice(0, topN);
  if (!list.length) {
    return '🏆 *Рейтинг кандидатов*\n\n_Пока нет кандидатов с AI-оценкой за выбранный период._';
  }

  const lines = list.map((c, i) => {
    const exp = c.experience_years !== null && c.experience_years !== undefined ? `${c.experience_years}л` : '?л';
    const score = c.ai_score !== null && c.ai_score !== undefined ? `${c.ai_score}/10` : '—';
    const emo = scoreEmoji(c.ai_score);
    const verdict = c.ai_verdict || (c.qualified === true ? 'Подходит' : 'Проверить');
    const clarify = c.ai_needs_clarification ? '  ❗ _Уточнить:_ ' + escMd(truncate(c.ai_clarification || '', 110)) : '';
    const url = c.candidate_url || c.application_url;
    const nameMd = url ? `[${escMd(c.candidate_name || 'без имени')}](${url})` : `*${escMd(c.candidate_name || 'без имени')}*`;

    return `${rankBadge(i)} ${nameMd} ${emo} *${score}*\n   _${escMd(truncate(c.position || '—', 60))}_ · ${exp} · ${escMd(verdict)}${clarify}`;
  });

  const sinceLabel = new Date(config.ranking.since).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const updated = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });

  return (
    `🏆 *Рейтинг кандидатов* (топ ${list.length}/${candidates.length})\n` +
    `_с ${sinceLabel} · обновлено ${updated} МСК_\n\n` +
    lines.join('\n\n')
  );
}

async function pinMessage(messageId) {
  try {
    await axios.post(`${TG_API}/pinChatMessage`, {
      chat_id: config.telegram.channelId,
      message_id: messageId,
      disable_notification: true,
    });
    logger.info(`TG: pinned ranking message ${messageId}`);
  } catch (err) {
    // Если права не позволяют закрепить — это ОК, не падаем.
    logger.warn(`TG pinChatMessage failed: ${err.response?.data?.description || err.message}`);
  }
}

/**
 * Создаёт или обновляет (editMessageText) закреплённое сообщение с рейтингом.
 * id сообщения хранится в ui_state.
 */
export async function upsertPinnedRanking() {
  const candidates = await getRanking({
    since: config.ranking.since,
    limit: config.ranking.limit,
  });
  const text = buildRankingMessage(candidates, config.ranking.telegramTop);

  // Telegram limit 4096
  const safeText = text.length > 4000 ? text.slice(0, 3990) + '\n…' : text;

  const existingId = await getUiState(PIN_STATE_KEY).catch(() => null);

  // Кнопка-ссылка на Mini App в pinned-сообщении.
  // Direct Link приоритет — открывает внутри Telegram с initData.
  const pinnedMiniAppUrl = buildMiniAppLink(null, {
    botUsername: config.telegram.botUsername,
    miniAppShortName: config.telegram.miniAppShortName,
    webappUrl: config.api.publicUrl,
  });
  const replyMarkup = pinnedMiniAppUrl
    ? { inline_keyboard: [[{ text: '📱 Открыть Mini App', url: pinnedMiniAppUrl }]] }
    : undefined;

  if (existingId) {
    try {
      await axios.post(`${TG_API}/editMessageText`, {
        chat_id: config.telegram.channelId,
        message_id: Number(existingId),
        text: safeText,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: replyMarkup,
      });
      logger.info(`TG: ranking pinned message ${existingId} updated (${candidates.length} candidates)`);
      return existingId;
    } catch (err) {
      const desc = err.response?.data?.description || err.message;
      // "message is not modified" — содержимое не изменилось, это норма
      if (desc.includes('not modified')) {
        logger.debug('TG: ranking unchanged');
        return existingId;
      }
      logger.warn(`TG editMessageText failed (${desc}), will create new pinned message`);
      // Падает — создаём заново
    }
  }

  // Отправляем новое и закрепляем
  try {
    const res = await axios.post(`${TG_API}/sendMessage`, {
      chat_id: config.telegram.channelId,
      text: safeText,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: replyMarkup,
    });
    const newId = res.data?.result?.message_id;
    if (!newId) {
      logger.error('TG: failed to get message_id from sendMessage response');
      return null;
    }
    await setUiState(PIN_STATE_KEY, newId).catch(err => logger.warn(`Save pin id failed: ${err.message}`));
    await pinMessage(newId);
    logger.info(`TG: ranking pinned message created ${newId} (${candidates.length} candidates)`);
    return newId;
  } catch (err) {
    logger.error(`TG sendMessage (ranking) failed: ${err.response?.data?.description || err.message}`);
    return null;
  }
}
