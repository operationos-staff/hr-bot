/**
 * Ретроактивный AI-анализ уже обработанных кандидатов
 * Анализирует ✅ и 🟡 кандидатов у которых нет ai_score
 *
 * Запуск: node scripts/analyze-existing.js
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { fetchCandidateFullText, analyzeCandidate } from '../src/services/ai-scorer.js';
import { saveAiScore } from '../src/services/database.js';
import { config } from '../src/config.js';
import { sleep } from '../src/utils/helpers.js';
import { logger } from '../src/utils/logger.js';

const supabase = createClient(config.supabase.url, config.supabase.serviceKey);

async function main() {
  console.log('=== Ретроактивный AI-анализ кандидатов ===\n');

  // Получаем всех ✅ и 🟡 без ai_score
  const { data: candidates, error } = await supabase
    .from('applications')
    .select('source, external_id, candidate_name, candidate_url, raw_data')
    .or('qualified.is.null,qualified.eq.true')  // ✅ и 🟡 (см. lessons.md)
    .is('ai_score', null)           // ещё не анализировали
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Ошибка запроса:', error.message);
    return;
  }

  console.log(`Найдено кандидатов без AI-оценки: ${candidates.length}\n`);

  let done = 0;
  let failed = 0;

  for (const candidate of candidates) {
    try {
      console.log(`[${done + 1}/${candidates.length}] ${candidate.candidate_name}...`);

      // Скачиваем PDF резюме
      const resumeText = await fetchCandidateFullText(
        candidate.candidate_url,
        config.habr.cookie
      );

      // Анализируем
      const analysis = await analyzeCandidate(candidate, resumeText);

      if (analysis) {
        await saveAiScore(candidate.source, candidate.external_id, {
          score: analysis.score,
          verdict: analysis.verdict,
          summary: analysis.summary,
        });
        console.log(`  ✅ ${analysis.score}/10 — ${analysis.verdict}`);
        done++;
      } else {
        console.log(`  ⚠️ Анализ не получен`);
        failed++;
      }

      // Пауза между запросами (DeepSeek rate limit)
      await sleep(2000);

    } catch (err) {
      console.log(`  ❌ Ошибка: ${err.message}`);
      failed++;
      await sleep(3000);
    }
  }

  console.log(`\n=== Готово ===`);
  console.log(`Проанализировано: ${done}`);
  console.log(`Ошибок: ${failed}`);
  console.log(`\nТеперь запусти рейтинг: node scripts/top-candidates.js`);
}

main().catch(console.error);
