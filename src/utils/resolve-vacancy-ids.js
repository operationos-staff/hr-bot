/**
 * resolveVacancyIds — общий резолвер списка vacancy_id для habr.js/hh.js (E2).
 *
 * Приоритет:
 *   1. Если в .env заданы HABR_VACANCY_IDS/HH_VACANCY_IDS — берём их (override для dev).
 *   2. Иначе — список тянется из БД через getActiveVacancyExternalIds.
 *
 * Тогда добавление вакансии = INSERT в vacancies (или через Mini App), без
 * правки .env и без рестарта поллера.
 *
 * @param {string[]|undefined} envIds — значения из config.X.vacancyIds
 * @param {() => Promise<string[]>} dbGetter — например, () => getActiveVacancyExternalIds('habr')
 * @returns {Promise<string[]>}
 */
export async function resolveVacancyIds(envIds, dbGetter) {
  if (Array.isArray(envIds) && envIds.length > 0) {
    return envIds;
  }
  try {
    const fromDb = await dbGetter();
    return Array.isArray(fromDb) ? fromDb : [];
  } catch {
    return [];
  }
}
