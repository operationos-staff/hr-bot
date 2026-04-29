/**
 * Чистые функции нормализации ответов HH API в формат application
 * для poller.processApplication. Без зависимостей от axios/config —
 * полностью pure, тестируется юнитами с фикстурами.
 *
 * API endpoints (employer mode):
 * - GET /negotiations/employer?employer_id=...&vacancy_id=...
 * - GET /resumes/{id}
 *
 * Принципы:
 * - external_id всегда String
 * - experience_raw — число месяцев (parseExperienceYears понимает оба формата)
 * - citizenship — текстовое название из API; нормализация в RU/OTHER в filter.js
 * - все отсутствующие поля = null, никогда undefined
 */

/**
 * Нормализует ответ /resumes/{id} в плоский объект.
 * @param {Object|null} resume — ответ API HH
 * @returns {{citizenship: string|null, experience_raw: number|null, position: string|null, location: string|null}}
 */
export function normalizeHHResume(resume) {
  if (!resume || typeof resume !== 'object') {
    return { citizenship: null, experience_raw: null, position: null, location: null };
  }

  // citizenship — массив [{id, name}], берём первый
  const citizenshipArr = Array.isArray(resume.citizenship) ? resume.citizenship : [];
  const citizenship = citizenshipArr.length > 0 && citizenshipArr[0]?.name
    ? citizenshipArr[0].name
    : null;

  // experience_raw — число месяцев из total_experience.months
  const experience_raw = (resume.total_experience && typeof resume.total_experience.months === 'number')
    ? resume.total_experience.months
    : null;

  // position: title (приоритет) → experience[0].position
  const title = (typeof resume.title === 'string' && resume.title.trim()) ? resume.title.trim() : null;
  const expPosition = Array.isArray(resume.experience) && resume.experience[0]?.position
    ? resume.experience[0].position
    : null;
  const position = title || expPosition || null;

  // location из area.name
  const location = resume.area?.name || null;

  return { citizenship, experience_raw, position, location };
}

/**
 * Нормализует один negotiation + резюме в объект application для poller.
 * @param {Object} neg — items[i] из /negotiations/employer
 * @param {Object|null} resume — ответ /resumes/{id} (или null если не удалось загрузить)
 */
export function normalizeHHNegotiation(neg, resume) {
  const r = normalizeHHResume(resume);

  const firstName = neg.resume?.first_name || '';
  const lastName = neg.resume?.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();
  const candidateName = fullName || 'Имя не указано';

  return {
    source: 'hh',
    external_id: String(neg.id),
    candidate_name: candidateName,
    candidate_url: neg.resume?.alternate_url || null,
    application_url: neg.alternate_url || null,
    vacancy_title: neg.vacancy?.name || null,
    location: r.location,
    citizenship: r.citizenship,
    experience_raw: r.experience_raw,
    cover_letter: neg.message || null,
    received_at: neg.created_at || null,
    position: r.position,
    raw_data: { neg, resume },
  };
}
