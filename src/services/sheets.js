import { google } from 'googleapis';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { getRanking } from './database.js';

let sheetsClient = null;

const RANKING_HEADERS = [
  '#',
  'Статус',
  'Источник',
  'AI оценка',
  'Вердикт',
  'Уточнить?',
  'Что уточнить',
  'Имя кандидата',
  'Должность',
  'Опыт (лет)',
  'Гражданство',
  'Локация',
  'Вакансия',
  'Получено',
  'Резюме (ссылка)',
];

async function getClient() {
  if (sheetsClient) return sheetsClient;

  const auth = new google.auth.GoogleAuth({
    keyFile: config.sheets.serviceAccountJson,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

/**
 * Добавляет строку подходящего кандидата в Google Sheets.
 */
export async function appendQualifiedCandidate(app) {
  if (!config.sheets.spreadsheetId) return; // Google Sheets не настроен
  if (app.qualified === false) return; // только ✅ и 🟡

  const client = await getClient();
  const sheetName = config.sheets.sheetQualified;

  const statusLabel = app.qualified === true ? '✅ Подходит' : '🟡 Проверить';

  const row = [
    new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }),
    statusLabel,
    app.source === 'habr' ? 'Хабр Карьера' : 'HeadHunter',
    app.candidate_name || '',
    app.position || '',
    app.vacancy_title || '',
    app.location || '',
    app.citizenship === 'RU' ? 'Россия' : (app.citizenship_raw || app.citizenship || ''),
    app.experience_years !== null ? String(app.experience_years) : '',
    app.ai_score ? `${app.ai_score}/10` : '',   // AI оценка
    app.ai_verdict || '',                         // Вердикт тим-лида
    app.filter_reason || '',
    app.candidate_url || app.application_url || '',
  ];

  try {
    await client.spreadsheets.values.append({
      spreadsheetId: config.sheets.spreadsheetId,
      range: `${sheetName}!A:M`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [row] },
    });
    logger.info(`Sheets: appended row for ${app.candidate_name}`);
  } catch (err) {
    logger.error(`Sheets append failed: ${err.message}`);
  }
}

/**
 * Создаёт заголовки таблицы (запускается один раз при инициализации).
 */
export async function initSheetHeaders() {
  if (!config.sheets.spreadsheetId) return; // Google Sheets не настроен
  const client = await getClient();

  const headers = [
    'Дата получения',
    'Статус',
    'Источник',
    'Имя кандидата',
    'Должность',
    'Вакансия',
    'Локация',
    'Гражданство',
    'Опыт (лет)',
    'AI Оценка',
    'Вердикт тим-лида',
    'Причина пометки',
    'Ссылка',
  ];

  try {
    // Проверяем, есть ли уже данные в первой строке
    const res = await client.spreadsheets.values.get({
      spreadsheetId: config.sheets.spreadsheetId,
      range: `${config.sheets.sheetQualified}!A1`,
    });

    if (!res.data.values || res.data.values.length === 0) {
      await client.spreadsheets.values.update({
        spreadsheetId: config.sheets.spreadsheetId,
        range: `${config.sheets.sheetQualified}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [headers] },
      });
      logger.info('Sheets: headers initialized');
    }
  } catch (err) {
    logger.error(`Sheets initHeaders failed: ${err.message}`);
  }
}

// ============================================================
// Лист «Рейтинг» — отсортированный список кандидатов сверху вниз
// ============================================================

/**
 * Гарантирует, что в книге есть лист с именем sheetName.
 * Если нет — создаёт. Возвращает sheetId (число) или null при ошибке.
 */
async function ensureSheet(client, sheetName) {
  const meta = await client.spreadsheets.get({
    spreadsheetId: config.sheets.spreadsheetId,
    fields: 'sheets(properties(sheetId,title))',
  });

  const existing = (meta.data.sheets || []).find(s => s.properties?.title === sheetName);
  if (existing) return existing.properties.sheetId;

  const res = await client.spreadsheets.batchUpdate({
    spreadsheetId: config.sheets.spreadsheetId,
    requestBody: {
      requests: [{
        addSheet: {
          properties: {
            title: sheetName,
            gridProperties: { frozenRowCount: 1 },
          },
        },
      }],
    },
  });
  const sheetId = res.data.replies?.[0]?.addSheet?.properties?.sheetId;
  logger.info(`Sheets: created tab "${sheetName}" (id=${sheetId})`);
  return sheetId;
}

function formatRankingRow(c, idx) {
  const status = c.qualified === true ? '✅ Подходит' : '🟡 Проверить';
  const src = c.source === 'habr' ? 'Хабр' : 'HH';
  const date = c.received_at
    ? new Date(c.received_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })
    : '';
  const link = c.candidate_url || c.application_url || '';

  return [
    idx + 1,
    status,
    src,
    c.ai_score !== null && c.ai_score !== undefined ? `${c.ai_score}/10` : '',
    c.ai_verdict || '',
    c.ai_needs_clarification ? '❗ Да' : '',
    c.ai_clarification || '',
    c.candidate_name || '',
    c.position || '',
    c.experience_years !== null && c.experience_years !== undefined ? String(c.experience_years) : '',
    c.citizenship === 'RU' ? '🇷🇺 Россия' : (c.citizenship_raw || c.citizenship || ''),
    c.location || '',
    c.vacancy_title || '',
    date,
    link,
  ];
}

/**
 * Полностью пересоздаёт содержимое листа «Рейтинг»: очищает и пишет заголовки + строки.
 * Сортировка приходит из БД (getRanking).
 *
 * @returns {number} количество строк рейтинга, попавших в таблицу
 */
export async function refreshRankingSheet() {
  if (!config.sheets.spreadsheetId) {
    logger.debug('Sheets: skipping ranking refresh (GOOGLE_SHEETS_ID not set)');
    return 0;
  }

  const client = await getClient();
  const sheetName = config.sheets.sheetRanking;

  try {
    await ensureSheet(client, sheetName);

    const candidates = await getRanking({
      since: config.ranking.since,
      limit: config.ranking.limit,
    });

    // 1) Очищаем старое содержимое (всё, что было)
    await client.spreadsheets.values.clear({
      spreadsheetId: config.sheets.spreadsheetId,
      range: `${sheetName}!A1:Z10000`,
    });

    // 2) Пишем заголовки + строки
    const rows = candidates.map((c, i) => formatRankingRow(c, i));
    const values = [RANKING_HEADERS, ...rows];

    await client.spreadsheets.values.update({
      spreadsheetId: config.sheets.spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });

    logger.info(`Sheets: ranking refreshed — ${candidates.length} rows since ${config.ranking.since}`);
    return candidates.length;
  } catch (err) {
    logger.error(`Sheets refreshRankingSheet failed: ${err.message}`);
    return 0;
  }
}
