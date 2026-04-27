/**
 * habr-normalizer.js — чистая функция нормализации ответа Habr API
 *
 * Не импортирует config, logger, axios.
 * Принимает raw API item → возвращает нормализованный объект приложения.
 * Тестируется без .env.
 *
 * API endpoint: GET /api/frontend/vacancies/{id}/responses?page={n}
 * Структура подтверждена через DevTools 27.04.2026
 */

const BASE_URL = 'https://career.habr.com';

/**
 * Нормализует один элемент из list[] ответа Habr API.
 *
 * @param {object} item - { response: { id, publishedAt, message, author: {...} } }
 * @param {string|null} vacancyTitle - название вакансии
 * @param {string|number|null} vacancyId - ID вакансии для application_url
 * @returns {object} Нормализованный объект отклика
 */
export function normalizeHabrResponse(item, vacancyTitle = null, vacancyId = null) {
  const resp = item?.response;
  if (!resp?.author) return null; // некоторые элементы list могут не быть откликами

  const author = resp.author;

  const external_id = String(resp.id);

  const candidate_url = author.href
    ? `${BASE_URL}${author.href}`
    : null;

  // Опыт: value = месяцы (число). parseExperienceYears(number) умеет это обрабатывать.
  // Пример: { value: 117, title: "9 лет и 9 месяцев" }
  const experience_raw = author.experience?.value ?? null;

  // Гражданство: массив объектов или пустой массив
  // [] → null → 🟡 (не указано, частый случай)
  // [{ title: "Россия" }] → "Россия"
  // [{ title: "Таджикистан" }] → "Таджикистан" → после normalizeCitizenship = 'OTHER'
  const citizenship = author.citizenships?.length > 0
    ? author.citizenships.map(c => c.title).join(', ')
    : null;

  // Должность: предпочитаем lastJob (актуальная), fallback — специализации
  const position = author.lastJob?.position
    || author.specializations?.[0]?.title
    || null;

  return {
    source: 'habr',
    external_id,
    candidate_name: author.title || null,
    candidate_url,
    application_url: vacancyId ? `${BASE_URL}/vacancies/${vacancyId}` : null,
    vacancy_title: vacancyTitle,
    position,
    location: author.location?.title || null,  // только город (страна в citizenships)
    citizenship,                                 // сырая строка, null если не указано
    experience_raw,                              // число месяцев или null
    cover_letter: resp.message || null,
    received_at: resp.publishedAt?.date || new Date().toISOString(),
    raw_data: { response: resp },
  };
}
