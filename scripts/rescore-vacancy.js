#!/usr/bin/env node
/**
 * scripts/rescore-vacancy.js — переоценка всех откликов на конкретную вакансию.
 *
 * Запуск: npm run rescore -- <source> <external_id>
 * Пример: npm run rescore -- hh 132556253
 *
 * Используется когда:
 * 1. Сменили AI-промпт у вакансии — старые оценки больше неактуальны.
 * 2. Изменили formatHHResumeAsText или buildPromptForVacancy — нужно
 *    прогнать через AI заново с актуальной логикой.
 *
 * Алгоритм:
 *   - SELECT applications WHERE source=? AND vacancy_id = (vacancy.id) AND qualified != false
 *   - для каждого: формируем resumeText (PDF Хабра / formatHHResumeAsText)
 *   - вызываем analyzeCandidate(app, resumeText, vacancy)
 *   - saveAiScore с новой оценкой
 *   - 1 секунда между запросами (rate-limit DeepSeek)
 *
 * Не трогает: qualified=false (мы их и не оцениваем), AI-сообщения в Telegram
 * (повторно не шлём — иначе спам в канале).
 */

import { config } from '../src/config.js';
import { logger } from '../src/utils/logger.js';
import {
  supabase, getVacancyBySourceExternal, saveAiScore,
} from '../src/services/database.js';
import {
  analyzeCandidate, fetchCandidateFullText,
} from '../src/services/ai-scorer.js';
import { formatHHResumeAsText } from '../src/sources/hh-normalizer.js';
import { sleep } from '../src/utils/helpers.js';

async function main() {
  const [, , source, externalId] = process.argv;
  if (!source || !externalId) {
    console.error('Использование: npm run rescore -- <source> <external_id>');
    console.error('Пример:        npm run rescore -- hh 132556253');
    process.exit(1);
  }

  if (!config.deepseek?.apiKey) {
    console.error('❌  DEEPSEEK_API_KEY не задан — без него AI не вызывается.');
    process.exit(1);
  }

  console.log(`\n🔄  Поиск вакансии ${source}/${externalId}...`);
  const vacancy = await getVacancyBySourceExternal(source, externalId);
  if (!vacancy) {
    console.error(`❌  Вакансия не найдена в таблице vacancies. Сначала добавь её через UI/CLI/SQL.`);
    process.exit(1);
  }

  console.log(`✅  Вакансия: ${vacancy.title} (id=${vacancy.id}, prompt=${vacancy.ai_prompt?.length || 0} симв.)`);

  // Выгребаем все ✅/🟡 отклики на эту вакансию
  const { data: apps, error } = await supabase
    .from('applications')
    .select('source, external_id, candidate_name, candidate_url, qualified, raw_data, ai_score, ai_verdict, ai_analyzed_at')
    .eq('vacancy_id', vacancy.id)
    .neq('qualified', false)
    .order('received_at', { ascending: false });

  if (error) {
    console.error(`❌  DB error: ${error.message}`);
    process.exit(1);
  }

  console.log(`📋  Кандидатов к переоценке: ${apps.length}`);
  if (apps.length === 0) return;

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < apps.length; i++) {
    const app = apps[i];
    const tag = `${i + 1}/${apps.length}`;
    const name = app.candidate_name || 'без имени';

    try {
      // Тянем текст резюме под источник
      let resumeText;
      if (app.source === 'hh') {
        resumeText = formatHHResumeAsText(app.raw_data?.resume);
      } else {
        resumeText = await fetchCandidateFullText(app.candidate_url, config.habr.cookie);
      }

      const analysis = await analyzeCandidate(app, resumeText, vacancy);
      if (!analysis) {
        console.log(`  [${tag}] ⏭   ${name} — AI вернул null, пропуск`);
        skipped++;
        continue;
      }

      await saveAiScore(app.source, app.external_id, {
        score: analysis.score,
        verdict: analysis.verdict,
        summary: analysis.summary,
        needsClarification: !!analysis.needs_clarification,
        clarification: analysis.clarification || '',
      });

      const oldScore = app.ai_score ?? '?';
      console.log(`  [${tag}] ${analysis.score}/10  ${name} (было ${oldScore}) — ${analysis.verdict}`);
      success++;
    } catch (err) {
      console.error(`  [${tag}] ❌  ${name} — ${err.message}`);
      logger.error(`rescore: ${app.source}/${app.external_id} failed: ${err.message}`);
      failed++;
    }

    // Маленькая пауза, чтобы не словить rate-limit DeepSeek
    if (i < apps.length - 1) await sleep(1000);
  }

  console.log(`\n📊  Готово: ${success} переоценено, ${skipped} пропущено, ${failed} ошибок.`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
