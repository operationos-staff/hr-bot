import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

// `let` + live-binding ESM-экспорт позволяет тестам подменить клиент через _setSupabaseForTests.
// В продакшне переменная остаётся реальным клиентом до конца жизни процесса.
let supabase = createClient(config.supabase.url, config.supabase.serviceKey);

export { supabase };

/**
 * Только для тестов: инжектит mock-клиент, имитирующий supabase-js API.
 * НЕ ИСПОЛЬЗОВАТЬ в продакшн-коде.
 */
export function _setSupabaseForTests(client) {
  supabase = client;
}

/**
 * Проверяет, существует ли уже отклик в БД.
 * @returns {boolean}
 */
export async function isApplicationExists(source, externalId) {
  const { data, error } = await supabase
    .from('applications')
    .select('id')
    .eq('source', source)
    .eq('external_id', externalId)
    .maybeSingle();

  if (error) {
    logger.error(`DB isApplicationExists error: ${error.message}`);
    return false;
  }
  return !!data;
}

/**
 * Обновляет AI-оценку для существующего отклика.
 */
export async function saveAiScore(source, externalId, { score, verdict, summary, needsClarification = false, clarification = '' }) {
  const { error } = await supabase
    .from('applications')
    .update({
      ai_score: score,
      ai_verdict: verdict,
      ai_summary: summary,
      ai_needs_clarification: !!needsClarification,
      ai_clarification: clarification || null,
      ai_analyzed_at: new Date().toISOString(),
    })
    .eq('source', source)
    .eq('external_id', externalId);

  if (error) {
    logger.error(`DB saveAiScore error: ${error.message}`);
    throw error;
  }
  logger.debug(`DB: saved AI score ${score}/10 for ${source}/${externalId}`);
}

/**
 * Получает топ кандидатов по AI Score.
 */
export async function getTopCandidates(limit = 10) {
  const { data, error } = await supabase
    .from('applications')
    .select('candidate_name, candidate_url, position, experience_years, citizenship, ai_score, ai_verdict, ai_summary, ai_needs_clarification, ai_clarification, received_at')
    .not('ai_score', 'is', null)
    .order('ai_score', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error(`DB getTopCandidates error: ${error.message}`);
    return [];
  }
  return data;
}

/**
 * Получает рейтинг кандидатов сверху вниз.
 * Берёт ✅ и 🟡 (qualified=true|null), у которых дата получения >= since.
 * Сортировка: ai_score DESC NULLS LAST → experience_years DESC NULLS LAST → received_at DESC.
 *
 * @param {Object} opts
 * @param {string} opts.since   ISO-строка (default: '2026-04-20T00:00:00Z')
 * @param {number} opts.limit   default: 100
 */
export async function getRanking({ since = '2026-04-20T00:00:00Z', limit = 100, vacancyId = null } = {}) {
  // ВАЖНО: .in('qualified', [true, null]) ломается в PostgREST —
  // null-литерал передаётся строкой "null" и Postgres не парсит его как boolean.
  // Используем .or() с is.null для корректной обработки null.
  let query = supabase
    .from('applications')
    .select(`
      source, external_id, candidate_name, candidate_url, application_url,
      position, vacancy_title, vacancy_id, location, citizenship, citizenship_raw,
      experience_years, qualified, filter_reason,
      ai_score, ai_verdict, ai_summary, ai_needs_clarification, ai_clarification,
      processed_at, processed_by,
      received_at, created_at
    `)
    .or('qualified.is.null,qualified.eq.true')
    .gte('received_at', since);

  // D5: фильтр по vacancy_id для Mini App-страниц per-vacancy
  if (vacancyId) {
    query = query.eq('vacancy_id', vacancyId);
  }

  const { data, error } = await query
    .order('ai_score', { ascending: false, nullsFirst: false })
    .order('experience_years', { ascending: false, nullsFirst: false })
    .order('received_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.error(`DB getRanking error: ${error.message}`);
    return [];
  }
  return data || [];
}

/**
 * UI state: key/value хранилище (например, для id pinned-сообщения Telegram).
 */
export async function getUiState(key) {
  const { data, error } = await supabase
    .from('ui_state')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  if (error) {
    logger.error(`DB getUiState error: ${error.message}`);
    return null;
  }
  return data?.value || null;
}

export async function setUiState(key, value) {
  const { error } = await supabase
    .from('ui_state')
    .upsert({ key, value: value === null ? null : String(value), updated_at: new Date().toISOString() });
  if (error) {
    logger.error(`DB setUiState error: ${error.message}`);
    throw error;
  }
}

/**
 * Сохраняет отклик в БД.
 * @param {Object} application
 */
export async function saveApplication(application) {
  const { error } = await supabase
    .from('applications')
    .insert(application);

  if (error) {
    if (error.code === '23505') {
      // unique violation — уже есть, не страшно
      logger.debug(`Application already exists: ${application.source}/${application.external_id}`);
      return;
    }
    logger.error(`DB saveApplication error: ${error.message}`, { application });
    throw error;
  }

  logger.info(`Saved application: ${application.source}/${application.external_id} qualified=${application.qualified}`);
}

// ============================================================
// Vacancies (D1) — модель «вакансия как first-class объект»
// ============================================================

/**
 * Получить вакансию по паре (source, external_id).
 * Возвращает строку из БД или null если не найдена / при ошибке.
 */
export async function getVacancyBySourceExternal(source, externalId) {
  const { data, error } = await supabase
    .from('vacancies')
    .select('*')
    .eq('source', source)
    .eq('external_id', String(externalId))
    .maybeSingle();

  if (error) {
    logger.error(`DB getVacancyBySourceExternal error: ${error.message}`);
    return null;
  }
  return data || null;
}

/**
 * Достать application по (source, external_id) — используется при пуше в воронку clon2.
 * Возвращает полную строку с AI-полями (ai_score, ai_verdict, ai_summary, ai_*_clarification).
 */
export async function getApplicationBySourceExternal(source, externalId) {
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('source', source)
    .eq('external_id', String(externalId))
    .maybeSingle();

  if (error) {
    logger.error(`DB getApplicationBySourceExternal error: ${error.message}`);
    throw error;
  }
  return data || null;
}

/**
 * Список external_id активных вакансий по источнику (E1).
 * Используется в habr.js / hh.js, чтобы поллер брал список ID из БД,
 * а не из .env. Тогда добавить вакансию = INSERT в vacancies, без рестарта.
 *
 * @param {'habr'|'hh'} source
 * @returns {Promise<string[]>}
 */
export async function getActiveVacancyExternalIds(source) {
  const { data, error } = await supabase
    .from('vacancies')
    .select('external_id')
    .eq('source', source)
    .eq('is_active', true);

  if (error) {
    logger.error(`DB getActiveVacancyExternalIds error: ${error.message}`);
    return [];
  }
  return (data || []).map(row => String(row.external_id)).filter(Boolean);
}

/**
 * Список вакансий. По умолчанию — только активные.
 * Сортировка: created_at DESC (новые сверху).
 */
export async function listVacancies({ onlyActive = true } = {}) {
  let query = supabase.from('vacancies').select('*');

  if (onlyActive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    logger.error(`DB listVacancies error: ${error.message}`);
    return [];
  }
  return data || [];
}

/**
 * Привязать отклик к вакансии (или отвязать, если vacancyId=null).
 */
export async function setApplicationVacancy(applicationId, vacancyId) {
  const { error } = await supabase
    .from('applications')
    .update({ vacancy_id: vacancyId })
    .eq('id', applicationId);

  if (error) {
    logger.error(`DB setApplicationVacancy error: ${error.message}`);
    throw error;
  }
}

/**
 * Создать или обновить вакансию (по UNIQUE source+external_id).
 * Используется при сидировании из миграции и через админку.
 */
export async function upsertVacancy(vacancy) {
  const payload = {
    source: vacancy.source,
    external_id: String(vacancy.external_id),
    title: vacancy.title || null,
    description: vacancy.description || null,
    ai_prompt: vacancy.ai_prompt || null,
    telegram_label: vacancy.telegram_label || null,
    is_active: vacancy.is_active !== false, // по умолчанию активна
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('vacancies')
    .upsert(payload, { onConflict: 'source,external_id' });

  if (error) {
    logger.error(`DB upsertVacancy error: ${error.message}`);
    throw error;
  }
}

/**
 * Отмечает отклик как «обработан» (F2) — или снимает метку.
 *
 * @param {string} source         — 'habr' | 'hh'
 * @param {string} externalId     — id отклика в источнике
 * @param {Object} opts
 * @param {string} opts.by        — кто отметил (Telegram username из req.tgUser)
 * @param {boolean} opts.value    — true: пометить, false: снять метку
 */
export async function markApplicationProcessed(source, externalId, { by, value }) {
  const payload = value
    ? { processed_at: new Date().toISOString(), processed_by: by || null }
    : { processed_at: null, processed_by: null };

  const { error } = await supabase
    .from('applications')
    .update(payload)
    .eq('source', source)
    .eq('external_id', String(externalId));

  if (error) {
    logger.error(`DB markApplicationProcessed error: ${error.message}`);
    throw error;
  }
  logger.info(`Application ${source}/${externalId} processed=${value} by=${by || '-'}`);
}

/**
 * Обновляет токены HH в БД.
 */
export async function saveHHTokens({ accessToken, refreshToken, expiresAt }) {
  const { error } = await supabase
    .from('oauth_tokens')
    .upsert({
      provider: 'hh',
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    logger.error(`DB saveHHTokens error: ${error.message}`);
    throw error;
  }
}

/**
 * Получает токены HH из БД.
 */
export async function getHHTokens() {
  const { data, error } = await supabase
    .from('oauth_tokens')
    .select('*')
    .eq('provider', 'hh')
    .maybeSingle();

  if (error) {
    logger.error(`DB getHHTokens error: ${error.message}`);
    return null;
  }
  return data;
}
