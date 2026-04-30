/**
 * Хабр Карьера — API клиент для кабинета работодателя
 *
 * Используем внутренний JSON API (подтверждён через DevTools):
 * GET /api/frontend/vacancies/{vacancyId}/responses?page={n}
 *
 * Авторизация: cookie из браузера (передаётся через заголовок Cookie)
 * Данные: структурированный JSON с полным профилем кандидата
 */

import axios from 'axios';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { sleep } from '../utils/helpers.js';
import { normalizeHabrResponse } from './habr-normalizer.js';
import { getActiveVacancyExternalIds } from '../services/database.js';
import { resolveVacancyIds } from '../utils/resolve-vacancy-ids.js';

export { normalizeHabrResponse }; // re-export для удобства

const BASE_URL = 'https://career.habr.com';
const RESPONSES_PER_PAGE = 25;

// Фильтр по дате: обрабатывать только отклики начиная с этой даты
// Можно переопределить через HABR_FILTER_FROM_DATE=2026-04-20 в .env
const FILTER_FROM_DATE = new Date(
  process.env.HABR_FILTER_FROM_DATE
    ? `${process.env.HABR_FILTER_FROM_DATE}T00:00:00+03:00`
    : '2026-04-20T00:00:00+03:00'
);

const httpClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Cookie': config.habr.cookie,
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'ru-RU,ru;q=0.9',
    'Referer': BASE_URL,
    'X-Requested-With': 'XMLHttpRequest',
  },
  timeout: 15000,
});

/**
 * Получает страницу откликов через JSON API.
 * @param {string|number} vacancyId
 * @param {number} page
 * @returns {{ list: Array, meta: object }}
 */
export async function fetchResponsesPage(vacancyId, page = 1) {
  const url = `/api/frontend/vacancies/${vacancyId}/responses?page=${page}`;
  logger.debug(`Habr API: GET ${url}`);

  const res = await httpClient.get(url);

  // Проверяем авторизацию: если вернулся HTML вместо JSON — cookie протух
  if (typeof res.data === 'string') {
    throw new Error('Habr: cookie expired or invalid — API returned HTML instead of JSON');
  }

  return res.data; // { list: [...], meta: { ... } }
}

/**
 * Основная функция: собирает все новые отклики со всех вакансий Хабра.
 * @param {Function} isNewFn - async (source, externalId) => boolean
 * @returns {Array}
 */
export async function getNewHabrApplications(isNewFn) {
  // E2: если HABR_VACANCY_IDS не задан в .env — берём список из БД (vacancies таблица)
  const vacancyIds = await resolveVacancyIds(
    config.habr.vacancyIds,
    () => getActiveVacancyExternalIds('habr'),
  );

  if (!vacancyIds?.length) {
    logger.warn('Habr: ни в .env, ни в БД нет активных вакансий — skipping');
    return [];
  }

  const allApplications = [];

  for (const vacancyId of vacancyIds) {
    logger.info(`Habr: processing vacancy ${vacancyId}`);

    for (let page = 1; page <= config.habr.pagesToCheck; page++) {
      let data;
      try {
        data = await fetchResponsesPage(vacancyId, page);
      } catch (err) {
        logger.error(`Habr: failed to fetch vacancy ${vacancyId} page ${page}: ${err.message}`);
        if (err.message.includes('cookie expired')) throw err; // пусть poller отправит alert
        break;
      }

      const items = data.list || [];
      if (items.length === 0) {
        logger.debug(`Habr: vacancy ${vacancyId} page ${page} is empty, stopping`);
        break;
      }

      let newOnPage = 0;
      let oldCount = 0;

      for (const item of items) {
        const external_id = String(item.response?.id);
        if (!external_id) continue;

        // Фильтр по дате: пропускаем отклики до 20 апреля 2026
        const responseDate = new Date(item.response?.publishedAt?.date || 0);
        if (responseDate < FILTER_FROM_DATE) {
          oldCount++;
          continue;
        }

        const isNew = await isNewFn('habr', external_id);
        if (!isNew) continue;

        newOnPage++;
        const normalized = normalizeHabrResponse(item, null, vacancyId);
        if (!normalized) continue; // пропускаем элементы без response
        allApplications.push(normalized);
      }

      if (oldCount > 0) logger.debug(`Habr: skipped ${oldCount} responses older than Apr 20`);

      logger.info(`Habr: vacancy ${vacancyId} page ${page}: ${items.length} total, ${newOnPage} new`);

      // Если ни одного нового на странице — дальше не идём
      if (newOnPage === 0 && page > 1) break;

      await sleep(config.worker.requestDelayMs);
    }
  }

  return allApplications;
}
