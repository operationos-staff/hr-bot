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
 * Форматирует JSON-резюме HH в связный русский текст для AI-оценщика (D8).
 * Pure-функция — без зависимостей от axios/config.
 *
 * @param {Object|null} resume — ответ API HH /resumes/{id}
 * @returns {string} многострочный текст резюме (или '' если resume пуст)
 */
export function formatHHResumeAsText(resume) {
  if (!resume || typeof resume !== 'object') return '';

  const lines = [];

  // ФИО
  const fio = [resume.last_name, resume.first_name, resume.middle_name].filter(Boolean).join(' ').trim();
  if (fio) lines.push(`ФИО: ${fio}`);

  // Возраст
  if (typeof resume.age === 'number') lines.push(`Возраст: ${resume.age}`);

  // Пол
  if (resume.gender?.name) lines.push(`Пол: ${resume.gender.name}`);

  // Локация
  if (resume.area?.name) lines.push(`Город: ${resume.area.name}`);

  // Гражданство
  const cit = Array.isArray(resume.citizenship)
    ? resume.citizenship.map(c => c?.name).filter(Boolean).join(', ')
    : null;
  if (cit) lines.push(`Гражданство: ${cit}`);

  // Желаемая позиция
  if (resume.title) lines.push(`Желаемая позиция: ${resume.title}`);

  // ЗП
  if (resume.salary?.amount) {
    const cur = resume.salary.currency || '';
    lines.push(`Желаемая ЗП: ${resume.salary.amount} ${cur}`.trim());
  }

  // Общий опыт
  if (typeof resume.total_experience?.months === 'number') {
    const years = Math.round(resume.total_experience.months / 12 * 10) / 10;
    lines.push(`Общий опыт: ${years} лет (${resume.total_experience.months} месяцев)`);
  }

  // История работы
  if (Array.isArray(resume.experience) && resume.experience.length > 0) {
    lines.push('');
    lines.push('История работы:');
    for (const exp of resume.experience) {
      const period = `${exp.start || '?'} — ${exp.end || 'настоящее время'}`;
      const head = `• ${period}: ${exp.position || '—'} в ${exp.company || '—'}`;
      lines.push(head);
      if (exp.description) {
        // Очищаем HTML-теги из описания (HH часто отдаёт <p>, <strong>)
        const desc = String(exp.description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (desc) lines.push(`  ${desc.slice(0, 800)}`);
      }
    }
  }

  // Образование
  const edu = resume.education?.primary;
  if (Array.isArray(edu) && edu.length > 0) {
    lines.push('');
    lines.push('Образование:');
    for (const e of edu) {
      const parts = [e.name, e.organization, e.result, e.year].filter(Boolean);
      if (parts.length) lines.push(`• ${parts.join(', ')}`);
    }
  }

  // Навыки (skill_set — массив строк)
  if (Array.isArray(resume.skill_set) && resume.skill_set.length > 0) {
    lines.push('');
    lines.push(`Навыки: ${resume.skill_set.join(', ')}`);
  }

  // Ключевые навыки (key_skills — массив объектов с name)
  if (Array.isArray(resume.key_skills) && resume.key_skills.length > 0) {
    const keys = resume.key_skills.map(k => k?.name).filter(Boolean);
    if (keys.length) lines.push(`Ключевые навыки: ${keys.join(', ')}`);
  }

  // Языки
  if (Array.isArray(resume.language) && resume.language.length > 0) {
    const langs = resume.language
      .map(l => l?.name && l?.level?.name ? `${l.name} (${l.level.name})` : l?.name)
      .filter(Boolean);
    if (langs.length) lines.push(`Языки: ${langs.join(', ')}`);
  }

  return lines.join('\n');
}

/**
 * Нормализует один negotiation + резюме в объект application для poller.
 *
 * @param {Object} neg — items[i] из /negotiations/response
 * @param {Object|null} resume — ответ /resumes/{id} (или null если не удалось загрузить)
 * @param {string|null} [vacancyExternalIdOverride] — явный vacancy_id когда мы
 *   передаём его в URL-параметре /negotiations/response?vacancy_id=...
 *   HH в этом endpoint НЕ возвращает поле neg.vacancy в каждой negotiation
 *   (избыточно), и без override мы получили бы vacancy_external_id=null
 *   → poller не нашёл бы vacancy в БД → сохранил бы запись с vacancy_id=NULL.
 */
export function normalizeHHNegotiation(neg, resume, vacancyExternalIdOverride = null) {
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
    vacancy_external_id: vacancyExternalIdOverride != null
      ? String(vacancyExternalIdOverride)
      : (neg.vacancy?.id != null ? String(neg.vacancy.id) : null),
    location: r.location,
    citizenship: r.citizenship,
    experience_raw: r.experience_raw,
    cover_letter: neg.message || null,
    received_at: neg.created_at || null,
    position: r.position,
    raw_data: { neg, resume },
  };
}
