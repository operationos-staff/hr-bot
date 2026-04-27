/**
 * Очистка данных и подготовка к чистому старту с 20 апреля 2026
 * Запуск: node scripts/cleanup-and-restart.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { config } from '../src/config.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

async function clearSupabase() {
  console.log('\n1. Очищаю Supabase...');

  const { error, count } = await supabase
    .from('applications')
    .delete({ count: 'exact' })
    .neq('id', '00000000-0000-0000-0000-000000000000'); // удалить все записи

  if (error) {
    console.error('❌ Ошибка:', error.message);
    return false;
  }

  console.log(`✅ Удалено записей из applications: ${count ?? 'все'}`);
  return true;
}

async function clearGoogleSheets() {
  console.log('\n2. Очищаю Google Sheets...');

  if (!config.sheets.spreadsheetId) {
    console.log('⚠️ GOOGLE_SHEETS_ID не задан, пропускаю');
    return;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: config.sheets.serviceAccountJson,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Получаем все данные чтобы узнать сколько строк
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.sheets.spreadsheetId,
      range: `${config.sheets.sheetQualified}!A:K`,
    });

    const rows = res.data.values || [];
    console.log(`Найдено строк: ${rows.length} (включая заголовок)`);

    if (rows.length <= 1) {
      console.log('✅ Таблица уже пустая');
      return;
    }

    // Удаляем все строки кроме заголовка
    await sheets.spreadsheets.values.clear({
      spreadsheetId: config.sheets.spreadsheetId,
      range: `${config.sheets.sheetQualified}!A2:K`,
    });

    console.log(`✅ Удалено ${rows.length - 1} строк из Google Sheets`);
  } catch (err) {
    console.error('❌ Ошибка Google Sheets:', err.message);
  }
}

async function main() {
  console.log('=== Чистый старт с 20 апреля 2026 ===');
  console.log('Удаляем все данные из Supabase и Google Sheets...\n');

  await clearSupabase();
  await clearGoogleSheets();

  console.log('\n=== Готово! ===');
  console.log('Теперь запусти бот: npm start');
  console.log('Бот обработает отклики начиная с 20 апреля 2026');
}

main().catch(console.error);
