/**
 * Funnel bridge — переносит один отклик из Bot_HH_Habr.applications
 * в clon2.candidates (status='new').
 *
 * Маппинг:
 *   applications.candidate_name         → candidates.full_name
 *   applications.position | vacancy_title → candidates.position
 *   applications.source ('hh'/'habr')   → candidates.source
 *   applications.candidate_url | application_url → candidates.source_url
 *   applications.ai_score (0..10)       → candidates.ai_score (0..100)  ← *10
 *   applications.ai_verdict + ai_summary → candidates.ai_summary (склейка)
 *   applications.cover_letter           → candidates.cover_letter
 *   applications.location, citizenship, experience_years, filter_reason
 *                                       → candidates.notes (склейка для контекста)
 *   applications.id (uuid)              → candidates.notes (для traceback)
 *
 * Идемпотентность: при попытке добавить тот же application повторно —
 * возвращает existing candidate (поиск по source+source_url).
 */

import { getClon2Client, isClon2Configured } from './clon2-supabase.js';
import { getApplicationBySourceExternal } from './database.js';
import { supabase } from './database.js';
import { logger } from '../utils/logger.js';

/**
 * @typedef {Object} PushResult
 * @property {boolean} ok
 * @property {'created'|'already_in_funnel'|'not_configured'|'application_not_found'|'error'} state
 * @property {string} [candidateId]
 * @property {string} [message]
 */

/**
 * Pushes a single application into clon2.candidates.
 * @param {string} source - 'hh' | 'habr'
 * @param {string} externalId
 * @param {string} [pushedBy] - HR username / id для аудит-поля funnel_pushed_by
 * @returns {Promise<PushResult>}
 */
export async function pushApplicationToFunnel(source, externalId, pushedBy = null) {
  if (!isClon2Configured()) {
    return { ok: false, state: 'not_configured', message: 'Сервер не настроен на запись в clon2 (нет CLON2_SUPABASE_*).' };
  }

  // 1. Берём отклик из своей БД
  let app;
  try {
    app = await getApplicationBySourceExternal(source, externalId);
  } catch (err) {
    logger.error(`pushApplicationToFunnel: DB read error: ${err.message}`);
    return { ok: false, state: 'error', message: err.message };
  }

  if (!app) {
    return { ok: false, state: 'application_not_found', message: `Отклик ${source}/${externalId} не найден в БД бота.` };
  }

  const clon2 = getClon2Client();
  const sourceUrl = app.candidate_url || app.application_url || null;

  // 2. Проверяем дубль (по source + source_url, без unique constraint в схеме clon2)
  if (sourceUrl) {
    const { data: existing } = await clon2
      .from('candidates')
      .select('id, full_name, status')
      .eq('source', source)
      .eq('source_url', sourceUrl)
      .limit(1)
      .maybeSingle();

    if (existing) {
      logger.info(`Application ${source}/${externalId} уже в воронке clon2 как candidate ${existing.id} (status=${existing.status})`);
      // Бекфилл funnel_candidate_id если applications ещё не помечены
      await markApplicationPushed(source, externalId, existing.id, pushedBy).catch(err => logger.warn(`markApplicationPushed backfill: ${err.message}`));
      return { ok: true, state: 'already_in_funnel', candidateId: existing.id, message: `Уже в воронке как «${existing.full_name}»` };
    }
  }

  // 3. Маппим поля
  const notesParts = [
    `[Bot_HH_Habr ${app.source}/${app.external_id}]`,
    app.location ? `📍 ${app.location}` : null,
    app.citizenship_raw ? `🌍 ${app.citizenship_raw}` : null,
    app.experience_years !== null && app.experience_years !== undefined ? `⏱ ${app.experience_years} лет` : null,
    app.filter_reason ? `🏷 filter: ${app.filter_reason}` : null,
    app.qualified === false ? '⚠ qualified=false (отклик был отфильтрован ботом)' : null,
  ].filter(Boolean);

  const aiParts = [
    app.ai_verdict ? `Вердикт: ${app.ai_verdict}` : null,
    app.ai_summary || null,
    app.ai_needs_clarification && app.ai_clarification ? `Уточнить: ${app.ai_clarification}` : null,
  ].filter(Boolean);

  // clon2 ai_score шкала 0..100, у нас 0..10 → *10 (округляем до 2 знаков)
  const aiScoreClon2 = (app.ai_score !== null && app.ai_score !== undefined)
    ? Math.min(100, Math.max(0, Number((app.ai_score * 10).toFixed(2))))
    : null;

  const payload = {
    full_name: app.candidate_name || '(без имени)',
    // position = должность кандидата из его резюме (или fallback на vacancy_title)
    position: app.position || app.vacancy_title || '(не указана)',
    // vacancy_title = открытая вакансия (PHP, AMO CRM, ...) — для фильтра воронок
    vacancy_title: app.vacancy_title || null,
    source, // 'hh' | 'habr' — оба значения валидны в clon2.candidates CHECK
    source_url: sourceUrl,
    cover_letter: app.cover_letter || null,
    notes: notesParts.join('\n') || null,
    ai_score: aiScoreClon2,
    ai_summary: aiParts.length ? aiParts.join('\n\n') : null,
    status: 'new',
  };

  // 4. INSERT
  const { data, error } = await clon2
    .from('candidates')
    .insert(payload)
    .select('id, full_name')
    .single();

  if (error) {
    logger.error(`pushApplicationToFunnel: clon2 insert error: ${error.message}`);
    return { ok: false, state: 'error', message: error.message };
  }

  // Помечаем applications что отклик ушёл в воронку (для UI Mini App)
  await markApplicationPushed(source, externalId, data.id, pushedBy).catch(err => logger.warn(`markApplicationPushed: ${err.message}`));

  logger.info(`Application ${source}/${externalId} → clon2.candidates ${data.id}`);
  return { ok: true, state: 'created', candidateId: data.id, message: `«${data.full_name}» добавлен в воронку Острова` };
}

/**
 * Помечает applications что отклик уже в воронке clon2.
 * Безопасно для повторных вызовов — UPDATE с фильтром is null.
 */
async function markApplicationPushed(source, externalId, candidateId, pushedBy) {
  const { error } = await supabase
    .from('applications')
    .update({
      funnel_candidate_id: candidateId,
      funnel_pushed_at: new Date().toISOString(),
      funnel_pushed_by: pushedBy || null,
    })
    .eq('source', source)
    .eq('external_id', String(externalId))
    .is('funnel_candidate_id', null); // не перезаписываем если уже помечено
  if (error) throw error;
}
