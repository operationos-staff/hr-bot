/**
 * HeadHunter API — клиент для работодателя
 * Фаза 2: подключается после запуска Хабра
 *
 * Документация: https://api.hh.ru/openapi/redoc
 * OAuth 2.0 для работодателей: https://github.com/hhru/api/blob/master/docs/authorization_for_employers.md
 */

import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { saveHHTokens, getHHTokens } from '../services/database.js';

const HH_API = 'https://api.hh.ru';
const USER_AGENT = 'Bot_HH_Habr/1.0 (vladistsvetkov@gmail.com)';

let currentAccessToken = config.hh.accessToken;

function getHeaders() {
  return {
    'Authorization': `Bearer ${currentAccessToken}`,
    'User-Agent': USER_AGENT,
    'HH-User-Agent': USER_AGENT,
  };
}

/**
 * Обновляет access_token через refresh_token.
 */
async function refreshAccessToken() {
  logger.info('HH: refreshing access token...');

  const tokens = await getHHTokens();
  const refreshToken = tokens?.refresh_token || config.hh.refreshToken;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.hh.clientId,
    client_secret: config.hh.clientSecret,
  });

  const res = await axios.post(`${HH_API}/token`, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  const { access_token, refresh_token, expires_in } = res.data;
  currentAccessToken = access_token;

  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
  await saveHHTokens({ accessToken: access_token, refreshToken: refresh_token, expiresAt });

  logger.info(`HH: token refreshed, expires at ${expiresAt}`);
}

/**
 * Выполняет запрос к HH API с автообновлением токена при 401.
 */
async function hhRequest(path, params = {}) {
  try {
    const res = await axios.get(`${HH_API}${path}`, {
      headers: getHeaders(),
      params,
    });
    return res.data;
  } catch (err) {
    if (err.response?.status === 401) {
      logger.warn('HH: 401, refreshing token and retrying...');
      await refreshAccessToken();

      const res = await axios.get(`${HH_API}${path}`, {
        headers: getHeaders(),
        params,
      });
      return res.data;
    }
    throw err;
  }
}

/**
 * Получает список новых откликов (negotiations) работодателя.
 */
export async function fetchHHNegotiations(vacancyId = null) {
  const params = {
    employer_id: config.hh.employerId,
    per_page: 50,
    page: 0,
    order_by: 'updated_at',
    // status: 'response' — только первичные отклики
  };

  if (vacancyId) params.vacancy_id = vacancyId;

  const data = await hhRequest('/negotiations/employer', params);
  return data.items || [];
}

/**
 * Получает полное резюме кандидата по ID.
 * Возвращает нормализованный объект.
 */
export async function fetchHHResume(resumeId) {
  const data = await hhRequest(`/resumes/${resumeId}`);

  // Гражданство — массив объектов [{id: '113', name: 'Россия'}, ...]
  const citizenship = data.citizenship?.map(c => c.name).join(', ') || null;

  // Опыт в месяцах
  const experience_raw = data.total_experience?.months ?? null;

  // Последняя должность
  const position = data.title || data.experience?.[0]?.position || null;

  // Локация
  const location = data.area?.name || null;

  return {
    citizenship,
    experience_raw, // число месяцев — parseExperienceYears умеет обрабатывать
    position,
    location,
    citizenship_raw: citizenship,
  };
}

/**
 * Основная функция: собирает новые отклики с HH.
 */
export async function getNewHHApplications(isNewFn) {
  if (!config.hh.employerId || !config.hh.accessToken) {
    logger.info('HH: not configured (Phase 2), skipping');
    return [];
  }

  const allApplications = [];

  let negotiations;
  try {
    negotiations = await fetchHHNegotiations();
  } catch (err) {
    logger.error(`HH: failed to fetch negotiations: ${err.message}`);
    return [];
  }

  for (const neg of negotiations) {
    const external_id = String(neg.id);
    const isNew = await isNewFn('hh', external_id);
    if (!isNew) continue;

    const resumeId = neg.resume?.id;
    let resumeData = {};

    if (resumeId) {
      try {
        resumeData = await fetchHHResume(resumeId);
      } catch (err) {
        logger.warn(`HH: failed to fetch resume ${resumeId}: ${err.message}`);
      }
    }

    allApplications.push({
      source: 'hh',
      external_id,
      candidate_name: neg.resume?.first_name
        ? `${neg.resume.first_name} ${neg.resume.last_name || ''}`.trim()
        : 'Имя не указано',
      candidate_url: neg.resume?.alternate_url || null,
      application_url: neg.alternate_url || null,
      vacancy_title: neg.vacancy?.name || null,
      cover_letter: neg.message || null,
      received_at: neg.created_at || new Date().toISOString(),
      ...resumeData,
      raw_data: { neg, resumeData },
    });
  }

  return allApplications;
}
