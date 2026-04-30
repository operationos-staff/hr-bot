/**
 * HeadHunter API — клиент для работодателя
 * Фаза 2: подключается после запуска Хабра
 *
 * Документация: https://api.hh.ru/openapi/redoc
 * OAuth 2.0 для работодателей: https://github.com/hhru/api/blob/master/docs/authorization_for_employers.md
 *
 * Тестируется через DI: getNewHHApplications принимает второй аргумент с моками
 * fetchNegotiations / fetchResume / isEnabled / vacancyIds.
 */

import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { saveHHTokens, getHHTokens, getActiveVacancyExternalIds } from '../services/database.js';
import { normalizeHHNegotiation } from './hh-normalizer.js';
import { paginate } from '../utils/paginate.js';
import { resolveVacancyIds } from '../utils/resolve-vacancy-ids.js';

const HH_API = 'https://api.hh.ru';
const USER_AGENT = 'Bot_HH_Habr/1.0 (vladistsvetkov@gmail.com)';

let currentAccessToken = config.hh.accessToken;
let tokenLoaded = !!config.hh.accessToken; // true если токен уже есть в env

function getHeaders() {
  return {
    'Authorization': `Bearer ${currentAccessToken}`,
    'User-Agent': USER_AGENT,
    'HH-User-Agent': USER_AGENT,
  };
}

/**
 * Ленивая загрузка токена из БД при первом запросе.
 * Сценарий: процесс стартанул, .env пустой по HH_ACCESS_TOKEN, токены лежат в
 * Supabase oauth_tokens (туда их положил OAuth callback). Без этой функции
 * первый hhRequest пошёл бы с пустым Bearer и получил 403 (а не 401),
 * refreshAccessToken не сработал бы.
 */
async function ensureTokenLoaded() {
  if (tokenLoaded) return;
  const tokens = await getHHTokens();
  if (tokens?.access_token) {
    currentAccessToken = tokens.access_token;
    logger.info('HH: access_token loaded from DB');
  } else if (config.hh.refreshToken || tokens?.refresh_token) {
    // access_token нет, но есть refresh — обновляем сразу
    await refreshAccessToken();
  } else {
    logger.warn('HH: no access_token and no refresh_token — пройди OAuth-flow на /hh/callback');
  }
  tokenLoaded = true;
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
  tokenLoaded = true;

  const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString();
  await saveHHTokens({ accessToken: access_token, refreshToken: refresh_token, expiresAt });

  logger.info(`HH: token refreshed, expires at ${expiresAt}`);
}

/**
 * Выполняет запрос к HH API с автообновлением токена при 401/403-bad_authorization.
 */
async function hhRequest(path, params = {}) {
  await ensureTokenLoaded();

  try {
    const res = await axios.get(`${HH_API}${path}`, {
      headers: getHeaders(),
      params,
      timeout: 15000,
    });
    return res.data;
  } catch (err) {
    const status = err.response?.status;
    const errType = err.response?.data?.errors?.[0]?.value || err.response?.data?.oauth_error;
    // 401 — стандартный «токен невалиден»
    // 403 + token_revoked / bad_authorization — HH иногда возвращает именно так,
    // когда токен отозван или с истекшим сроком. Тоже пробуем рефрешить.
    const isAuthError = status === 401 ||
      (status === 403 && /token_revoked|bad_authorization/i.test(String(errType)));

    if (isAuthError) {
      logger.warn(`HH: ${status} (${errType || 'unknown'}), refreshing token and retrying...`);
      await refreshAccessToken();

      const res = await axios.get(`${HH_API}${path}`, {
        headers: getHeaders(),
        params,
        timeout: 15000,
      });
      return res.data;
    }
    // Логируем тело ошибки HH (для 4xx это обычно полезный JSON с причиной)
    if (err.response?.data) {
      try {
        logger.error(`HH ${status} body: ${JSON.stringify(err.response.data)}`);
      } catch { /* ignore */ }
    }
    throw err;
  }
}

/**
 * Real fetch: список «неразобранных» откликов работодателя на конкретную вакансию.
 *
 * Endpoint: GET /negotiations/response?vacancy_id=...&page=0&per_page=50
 * Это статус «Все неразобранные» в HR-кабинете — то что нам нужно (новые отклики).
 *
 * Если HR-менеджер в кабинете перевёл отклик в другой статус (consider/discard/etc),
 * он перестаёт возвращаться этим endpoint'ом — но в нашей БД он уже есть, дедупликация
 * через external_id предотвратит повторную обработку.
 *
 * Старый /negotiations/employer возвращает 404 — устарел.
 */
export async function fetchHHNegotiations(vacancyId = null) {
  if (!vacancyId) {
    logger.warn('HH: fetchHHNegotiations called without vacancyId — endpoint /negotiations/response требует vacancy_id');
    return [];
  }
  // D9: пагинируемся по всем страницам (HH отдаёт по 50 на страницу).
  // maxPages=10 → до 500 откликов за один цикл, дальше дедупликация по БД.
  // pageDelayMs=500 — снижает шанс получить ddos-guard timeout при 5+ вакансиях.
  const items = await paginate(async (page) => {
    const data = await hhRequest('/negotiations/response', {
      vacancy_id: vacancyId,
      per_page: 50,
      page,
    });
    return data;
  }, { perPage: 50, maxPages: 10, pageDelayMs: 500 });
  return items;
}

/**
 * Real fetch: полное резюме кандидата по ID.
 */
export async function fetchHHResume(resumeId) {
  return await hhRequest(`/resumes/${resumeId}`);
}

/**
 * Проверяет, настроены ли HH-credentials.
 * Accept/refresh токены НЕ проверяются — они хранятся в Supabase (oauth_tokens)
 * и обновляются через refreshAccessToken после однократного OAuth-flow на /hh/callback.
 * Достаточно: employer_id + client_id + client_secret в .env.
 * @returns {boolean}
 */
export function isHHEnabled() {
  return Boolean(config.hh.employerId && config.hh.clientId && config.hh.clientSecret);
}

/**
 * Default-зависимости — реальные функции, тесты передают моки через второй аргумент.
 */
const defaultDeps = {
  isEnabled: isHHEnabled,
  fetchNegotiations: fetchHHNegotiations,
  fetchResume: fetchHHResume,
  // vacancyIds: null  → берётся из config.hh.vacancyIds; [] → employer-wide; ['v1','v2'] → итерация
};

/**
 * Основная функция: собирает новые отклики с HH.
 *
 * @param {Function} isNewFn  async (source, externalId) => boolean
 * @param {Object}   [deps]   опционально для тестов:
 *   - isEnabled() => bool
 *   - fetchNegotiations(vacancyId|null) => Promise<Array>
 *   - fetchResume(resumeId) => Promise<Object>
 *   - vacancyIds?: Array<string>  явный список ID; если undefined — берётся из config
 */
export async function getNewHHApplications(isNewFn, deps = {}) {
  const finalDeps = { ...defaultDeps, ...deps };

  if (!finalDeps.isEnabled()) {
    logger.info('HH: not configured (Phase 2), skipping');
    return [];
  }

  // E2: Резолвим список ID вакансий — env (если задан) → БД vacancies → []
  const vacancyIds = Array.isArray(deps.vacancyIds)
    ? deps.vacancyIds
    : await resolveVacancyIds(
        config.hh.vacancyIds,
        () => getActiveVacancyExternalIds('hh'),
      );

  // Собираем все negotiations со всех вакансий
  const allNegotiations = [];
  if (!vacancyIds || vacancyIds.length === 0) {
    // Один общий запрос (employer-wide)
    try {
      const negs = await finalDeps.fetchNegotiations(null);
      allNegotiations.push(...(negs || []));
    } catch (err) {
      logger.error(`HH: fetchNegotiations failed: ${err.message}`);
      return [];
    }
  } else {
    for (const vid of vacancyIds) {
      try {
        const negs = await finalDeps.fetchNegotiations(vid);
        allNegotiations.push(...(negs || []));
      } catch (err) {
        logger.error(`HH: fetchNegotiations(${vid}) failed: ${err.message}`);
        // продолжаем с другими вакансиями
      }
    }
  }

  // Дедуп + полное резюме + нормализация
  const result = [];
  for (const neg of allNegotiations) {
    const externalId = String(neg.id);
    const isNew = await isNewFn('hh', externalId);
    if (!isNew) continue;

    let resume = null;
    if (neg.resume?.id) {
      try {
        resume = await finalDeps.fetchResume(neg.resume.id);
      } catch (err) {
        logger.warn(`HH: fetchResume(${neg.resume.id}) failed: ${err.message}`);
      }
    }

    result.push(normalizeHHNegotiation(neg, resume));
  }

  return result;
}
