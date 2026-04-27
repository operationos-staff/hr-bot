import { getNewHabrApplications } from '../sources/habr.js';
import { getNewHHApplications } from '../sources/hh.js';
import { filterApplication } from '../services/filter.js';
import { sendApplicationCard, sendAlert, sendAiAnalysis, upsertPinnedRanking } from '../services/telegram.js';
import { appendQualifiedCandidate, refreshRankingSheet } from '../services/sheets.js';
import { isApplicationExists, saveApplication, saveAiScore } from '../services/database.js';
import { fetchCandidateFullText, analyzeCandidate, formatAiAnalysis } from '../services/ai-scorer.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Функция-предикат для дедупликации: возвращает true если отклик НОВЫЙ.
 */
async function isNew(source, externalId) {
  if (!externalId) return false;
  const exists = await isApplicationExists(source, String(externalId));
  return !exists;
}

/**
 * Обрабатывает один отклик: фильтрует, сохраняет, уведомляет.
 */
async function processApplication(raw) {
  const filterResult = filterApplication(raw);

  const app = {
    source: raw.source,
    external_id: String(raw.external_id),
    candidate_name: raw.candidate_name || null,
    candidate_url: raw.candidate_url || null,
    application_url: raw.application_url || null,
    vacancy_title: raw.vacancy_title || null,
    position: raw.position || null,
    location: raw.location || null,
    cover_letter: raw.cover_letter || null,
    citizenship_raw: raw.citizenship || null,
    received_at: raw.received_at || new Date().toISOString(),
    raw_data: raw.raw_data || {},
    ...filterResult,
  };

  // 1. Сохраняем в БД (все — и прошедшие, и нет)
  await saveApplication(app);

  // 2. Уведомляем в Telegram (только ✅ и 🟡)
  await sendApplicationCard(app);

  // 3. AI-анализ (только для ✅ и 🟡, если настроен DeepSeek)
  if (app.qualified !== false && config.deepseek?.apiKey) {
    try {
      const resumeText = await fetchCandidateFullText(app.candidate_url, config.habr.cookie);
      const analysis = await analyzeCandidate(app, resumeText);
      if (analysis) {
        const formatted = formatAiAnalysis(analysis);
        await sendAiAnalysis(app, formatted);
        // Сохраняем score в Supabase
        await saveAiScore(app.source, app.external_id, {
          score: analysis.score,
          verdict: analysis.verdict,
          summary: analysis.summary,
          needsClarification: !!analysis.needs_clarification,
          clarification: analysis.clarification || '',
        }).catch(err => logger.warn(`Failed to save AI score: ${err.message}`));
      }
    } catch (err) {
      logger.warn(`AI analysis failed for ${app.external_id}: ${err.message}`);
    }
  }

  // 4. Пишем в Google Sheets (только ✅ и 🟡)
  await appendQualifiedCandidate(app);

  const icon = app.qualified === true ? '✅' : app.qualified === null ? '🟡' : '❌';
  logger.info(`Processed ${icon} ${app.source}/${app.external_id} — ${app.candidate_name}`);
}

/**
 * Один цикл опроса всех источников.
 */
export async function runPollCycle() {
  logger.info('--- Poll cycle started ---');

  let totalProcessed = 0;

  // --- Хабр Карьера ---
  try {
    const habrApps = await getNewHabrApplications(isNew);
    logger.info(`Habr: ${habrApps.length} new applications`);

    for (const app of habrApps) {
      try {
        await processApplication(app);
        totalProcessed++;
      } catch (err) {
        logger.error(`Error processing Habr app ${app.external_id}: ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`Habr poll failed: ${err.message}`);
    if (err.message?.includes('cookie expired')) {
      await sendAlert('🍪 Cookie Хабр Карьеры протух! Нужно обновить HABR_COOKIE в .env');
    }
  }

  // --- HeadHunter (Фаза 2) ---
  try {
    const hhApps = await getNewHHApplications(isNew);
    logger.info(`HH: ${hhApps.length} new applications`);

    for (const app of hhApps) {
      try {
        await processApplication(app);
        totalProcessed++;
      } catch (err) {
        logger.error(`Error processing HH app ${app.external_id}: ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`HH poll failed: ${err.message}`);
  }

  // --- Обновление рейтинга (Sheets + Telegram pinned) ---
  // Делаем это, только если в этом цикле что-то поменялось,
  // иначе зря дёргаем API.
  if (totalProcessed > 0) {
    try {
      await refreshRankingSheet();
    } catch (err) {
      logger.warn(`refreshRankingSheet failed: ${err.message}`);
    }
    try {
      await upsertPinnedRanking();
    } catch (err) {
      logger.warn(`upsertPinnedRanking failed: ${err.message}`);
    }
  }

  logger.info(`--- Poll cycle done. Processed: ${totalProcessed} ---`);
  return totalProcessed;
}
