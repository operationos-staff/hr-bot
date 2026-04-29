import { getNewHabrApplications } from '../sources/habr.js';
import { getNewHHApplications } from '../sources/hh.js';
import { filterApplication } from '../services/filter.js';
import { sendApplicationCard, sendAlert, sendAiAnalysis, upsertPinnedRanking } from '../services/telegram.js';
import { appendQualifiedCandidate, refreshRankingSheet } from '../services/sheets.js';
import { isApplicationExists, saveApplication, saveAiScore, getVacancyBySourceExternal } from '../services/database.js';
import { fetchCandidateFullText, analyzeCandidate, formatAiAnalysis } from '../services/ai-scorer.js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

/**
 * Default-зависимости — реальные импорты.
 * В тестах передаём mock через второй аргумент в runPollCycle/processApplication.
 */
const defaultDeps = {
  getNewHabrApplications,
  getNewHHApplications,
  filterApplication,
  isApplicationExists,
  saveApplication,
  saveAiScore,
  sendApplicationCard,
  sendAlert,
  sendAiAnalysis,
  upsertPinnedRanking,
  appendQualifiedCandidate,
  refreshRankingSheet,
  fetchCandidateFullText,
  analyzeCandidate,
  formatAiAnalysis,
  getVacancyBySourceExternal,
};

/**
 * Функция-предикат для дедупликации: возвращает true если отклик НОВЫЙ.
 */
function makeIsNew(deps) {
  return async function isNew(source, externalId) {
    if (!externalId) return false;
    const exists = await deps.isApplicationExists(source, String(externalId));
    return !exists;
  };
}

/**
 * Обрабатывает один отклик: фильтрует, сохраняет, уведомляет.
 * Экспортируется для тестов; вне TDD вызывается только из runPollCycle.
 */
export async function processApplication(raw, deps = defaultDeps) {
  const filterResult = deps.filterApplication(raw);

  // D3: резолвим vacancy_id из БД по (source, vacancy_external_id), если задан
  let vacancy = null;
  if (raw.vacancy_external_id) {
    try {
      vacancy = await deps.getVacancyBySourceExternal(raw.source, raw.vacancy_external_id);
    } catch (err) {
      logger.warn(`vacancy lookup failed for ${raw.source}/${raw.vacancy_external_id}: ${err.message}`);
    }
  }

  const app = {
    source: raw.source,
    external_id: String(raw.external_id),
    candidate_name: raw.candidate_name || null,
    candidate_url: raw.candidate_url || null,
    application_url: raw.application_url || null,
    vacancy_title: raw.vacancy_title || null,
    vacancy_id: vacancy?.id || null,
    position: raw.position || null,
    location: raw.location || null,
    cover_letter: raw.cover_letter || null,
    citizenship_raw: raw.citizenship || null,
    received_at: raw.received_at || new Date().toISOString(),
    raw_data: raw.raw_data || {},
    ...filterResult,
  };

  // 1. Сохраняем в БД (все — и прошедшие, и нет)
  await deps.saveApplication(app);

  // 2. Уведомляем в Telegram (только ✅ и 🟡).
  //    D4: vacancy → префикс «[Вакансия: …]» в карточке (один канал).
  await deps.sendApplicationCard(app, vacancy);

  // 3. AI-анализ (только для ✅ и 🟡, если настроен DeepSeek).
  //    Per-vacancy промпт (D2) — vacancy идёт 3-м аргументом в analyzeCandidate.
  if (app.qualified !== false && config.deepseek?.apiKey) {
    try {
      const resumeText = await deps.fetchCandidateFullText(app.candidate_url, config.habr.cookie);
      const analysis = await deps.analyzeCandidate(app, resumeText, vacancy);
      if (analysis) {
        const formatted = deps.formatAiAnalysis(analysis);
        await deps.sendAiAnalysis(app, formatted);
        // Сохраняем score в Supabase
        await deps.saveAiScore(app.source, app.external_id, {
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
  await deps.appendQualifiedCandidate(app);

  const icon = app.qualified === true ? '✅' : app.qualified === null ? '🟡' : '❌';
  logger.info(`Processed ${icon} ${app.source}/${app.external_id} — ${app.candidate_name}`);
}

/**
 * Один цикл опроса всех источников.
 */
export async function runPollCycle(deps = defaultDeps) {
  logger.info('--- Poll cycle started ---');

  const isNew = makeIsNew(deps);
  let totalProcessed = 0;

  // --- Хабр Карьера ---
  try {
    const habrApps = await deps.getNewHabrApplications(isNew);
    logger.info(`Habr: ${habrApps.length} new applications`);

    for (const app of habrApps) {
      try {
        await processApplication(app, deps);
        totalProcessed++;
      } catch (err) {
        logger.error(`Error processing Habr app ${app.external_id}: ${err.message}`);
      }
    }
  } catch (err) {
    logger.error(`Habr poll failed: ${err.message}`);
    if (err.message?.includes('cookie expired') || err.message?.includes('cookie')) {
      await deps.sendAlert('🍪 Cookie Хабр Карьеры протух! Нужно обновить HABR_COOKIE в .env').catch(() => {});
    }
  }

  // --- HeadHunter (Фаза 2) ---
  try {
    const hhApps = await deps.getNewHHApplications(isNew);
    logger.info(`HH: ${hhApps.length} new applications`);

    for (const app of hhApps) {
      try {
        await processApplication(app, deps);
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
      await deps.refreshRankingSheet();
    } catch (err) {
      logger.warn(`refreshRankingSheet failed: ${err.message}`);
    }
    try {
      await deps.upsertPinnedRanking();
    } catch (err) {
      logger.warn(`upsertPinnedRanking failed: ${err.message}`);
    }
  }

  logger.info(`--- Poll cycle done. Processed: ${totalProcessed} ---`);
  return totalProcessed;
}
