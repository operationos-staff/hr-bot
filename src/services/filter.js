import { normalizeCitizenship, parseExperienceYears } from '../utils/helpers.js';

const MIN_EXPERIENCE_YEARS = 5;

/**
 * Результат фильтрации:
 * - qualified: true  → ✅ отправляем в канал и таблицу
 * - qualified: false → ❌ только в БД с reason
 * - qualified: null  → 🟡 отправляем с пометкой
 */
export function filterApplication(candidate) {
  const citizenship = normalizeCitizenship(candidate.citizenship);
  const experienceYears = parseExperienceYears(candidate.experience_raw);

  const issues = [];

  // --- Гражданство ---
  let citizenshipOk = null; // null = неизвестно
  if (citizenship === 'RU') {
    citizenshipOk = true;
  } else if (citizenship === 'OTHER') {
    citizenshipOk = false;
  }
  // null — не указано

  // --- Опыт ---
  let experienceOk = null;
  if (experienceYears !== null) {
    experienceOk = experienceYears >= MIN_EXPERIENCE_YEARS;
  }
  // null — не указан

  // Если хоть один параметр явно НЕ подходит → фильтруем
  if (citizenshipOk === false) {
    return {
      qualified: false,
      filter_reason: `Гражданство: ${candidate.citizenship || 'другая страна'}`,
      citizenship,
      experience_years: experienceYears,
    };
  }

  if (experienceOk === false) {
    return {
      qualified: false,
      filter_reason: `Опыт менее 5 лет: ${experienceYears} лет`,
      citizenship,
      experience_years: experienceYears,
    };
  }

  // Собираем пометки для 🟡
  if (citizenshipOk === null) issues.push('гражданство не указано');
  if (experienceOk === null) issues.push('опыт не указан');

  if (issues.length > 0) {
    return {
      qualified: null, // 🟡
      filter_reason: `Нет данных: ${issues.join(', ')}`,
      citizenship,
      experience_years: experienceYears,
    };
  }

  // Оба параметра в норме → ✅
  return {
    qualified: true,
    filter_reason: null,
    citizenship,
    experience_years: experienceYears,
  };
}
