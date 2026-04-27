/**
 * Ручной пересчёт рейтинга кандидатов.
 * Обновляет лист «Рейтинг» в Google Sheets и pinned-сообщение в Telegram.
 *
 * Запуск: node scripts/rebuild-ranking.js
 *
 * Используй после ретроактивного AI-анализа (analyze-existing.js)
 * или просто чтобы вручную обновить рейтинг.
 */

import 'dotenv/config';
import { refreshRankingSheet } from '../src/services/sheets.js';
import { upsertPinnedRanking } from '../src/services/telegram.js';
import { getRanking } from '../src/services/database.js';
import { config } from '../src/config.js';
import { logger } from '../src/utils/logger.js';

async function main() {
  console.log('=== Пересчёт рейтинга кандидатов ===\n');
  console.log(`Период: с ${config.ranking.since}`);
  console.log(`Лимит:  ${config.ranking.limit}`);
  console.log(`TG топ: ${config.ranking.telegramTop}\n`);

  // Превью в консоли
  const ranking = await getRanking({
    since: config.ranking.since,
    limit: config.ranking.limit,
  });
  console.log(`Найдено кандидатов: ${ranking.length}\n`);
  ranking.slice(0, 10).forEach((c, i) => {
    const score = c.ai_score !== null && c.ai_score !== undefined ? `${c.ai_score}/10` : '— ';
    const tag = c.ai_needs_clarification ? ' ❗ уточнить' : '';
    console.log(`${i + 1}. ${c.candidate_name || '?'} — ${score} — ${c.ai_verdict || '—'}${tag}`);
  });
  console.log('');

  // Обновляем Google Sheets
  try {
    const rows = await refreshRankingSheet();
    console.log(`✅ Sheets: лист «${config.sheets.sheetRanking}» обновлён (${rows} строк)`);
  } catch (err) {
    console.error(`❌ Sheets: ${err.message}`);
  }

  // Обновляем pinned в Telegram
  try {
    const id = await upsertPinnedRanking();
    if (id) {
      console.log(`✅ Telegram: pinned ranking message #${id}`);
    } else {
      console.log('⚠️  Telegram: pinned ranking не обновлён (см. логи)');
    }
  } catch (err) {
    console.error(`❌ Telegram: ${err.message}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    logger.error(`rebuild-ranking failed: ${err.message}`, err);
    process.exit(1);
  });
