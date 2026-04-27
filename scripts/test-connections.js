/**
 * Тест всех соединений перед запуском бота
 * Запуск: node scripts/test-connections.js
 */

import 'dotenv/config';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const OK = '✅';
const FAIL = '❌';

// =============================================
// 1. Хабр API
// =============================================
async function testHabr() {
  const vacancyId = process.env.HABR_VACANCY_IDS?.split(',')[0]?.trim();
  const cookie = process.env.HABR_COOKIE;

  if (!vacancyId || !cookie) {
    console.log(`${FAIL} Хабр: HABR_VACANCY_IDS или HABR_COOKIE не заданы`);
    return false;
  }

  try {
    const res = await axios.get(
      `https://career.habr.com/api/frontend/vacancies/${vacancyId}/responses?page=1`,
      {
        headers: {
          Cookie: cookie,
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 10000,
      }
    );

    if (typeof res.data === 'string') {
      console.log(`${FAIL} Хабр: cookie не работает (вернулся HTML, нужна авторизация)`);
      return false;
    }

    const count = res.data?.list?.length ?? 0;
    const total = res.data?.meta?.totalCount ?? '?';
    console.log(`${OK} Хабр API: соединение OK | откликов на странице: ${count} | всего: ${total}`);

    if (count > 0) {
      const first = res.data.list[0]?.response;
      console.log(`   Первый отклик: ${first?.author?.title} (id: ${first?.id})`);
    }
    return true;
  } catch (err) {
    console.log(`${FAIL} Хабр API: ${err.message}`);
    return false;
  }
}

// =============================================
// 2. Supabase
// =============================================
async function testSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    console.log(`${FAIL} Supabase: URL или SERVICE_KEY не заданы`);
    return false;
  }

  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from('applications')
      .select('id')
      .limit(1);

    if (error) {
      console.log(`${FAIL} Supabase: ${error.message}`);
      return false;
    }

    console.log(`${OK} Supabase: соединение OK | таблица applications доступна`);
    return true;
  } catch (err) {
    console.log(`${FAIL} Supabase: ${err.message}`);
    return false;
  }
}

// =============================================
// 3. Telegram
// =============================================
async function testTelegram() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const channelId = process.env.TELEGRAM_CHANNEL_ID;

  if (!token || !channelId) {
    console.log(`${FAIL} Telegram: TOKEN или CHANNEL_ID не заданы`);
    return false;
  }

  try {
    // Проверяем бота
    const botRes = await axios.get(`https://api.telegram.org/bot${token}/getMe`);
    const botName = botRes.data?.result?.username;

    // Отправляем тестовое сообщение
    const msgRes = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
      chat_id: channelId,
      text: '🤖 *Bot_HH_Habr* — тестовое сообщение\nСоединение работает!',
      parse_mode: 'Markdown',
    });

    if (msgRes.data?.ok) {
      console.log(`${OK} Telegram: бот @${botName} | сообщение отправлено в канал`);
      return true;
    } else {
      console.log(`${FAIL} Telegram: не удалось отправить сообщение`);
      return false;
    }
  } catch (err) {
    const detail = err.response?.data?.description || err.message;
    console.log(`${FAIL} Telegram: ${detail}`);
    return false;
  }
}

// =============================================
// Запуск
// =============================================
async function main() {
  console.log('\n=== Проверка соединений Bot_HH_Habr ===\n');

  const results = await Promise.allSettled([
    testHabr(),
    testSupabase(),
    testTelegram(),
  ]);

  const passed = results.filter(r => r.value === true).length;
  console.log(`\n=== Результат: ${passed}/3 проверок прошло ===`);

  if (passed === 3) {
    console.log('🚀 Всё готово! Можно запускать: npm start\n');
  } else {
    console.log('⚠️  Исправь ошибки выше перед запуском\n');
  }
}

main().catch(console.error);
