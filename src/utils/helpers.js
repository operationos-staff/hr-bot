/**
 * Парсит строку с опытом работы и возвращает количество лет.
 * Примеры входных данных с Хабра: "7 лет", "3 года 6 месяцев", "11 месяцев"
 * С HH: total_experience.months (число месяцев)
 */
export function parseExperienceYears(raw) {
  if (raw === null || raw === undefined) return null;

  // Если число — считаем что это месяцы (формат HH API)
  if (typeof raw === 'number') {
    return Math.round((raw / 12) * 10) / 10;
  }

  if (typeof raw !== 'string') return null;

  const str = raw.toLowerCase().trim();

  if (!str) return null;

  // Специальные случаи: "менее года", "меньше года" → 0.5
  if (str.includes('менее года') || str.includes('меньше года')) return 0.5;

  let totalMonths = 0;

  const yearsMatch = str.match(/(\d+)\s*(лет|год|года)/);
  const monthsMatch = str.match(/(\d+)\s*(месяц|месяца|месяцев)/);

  if (yearsMatch) totalMonths += parseInt(yearsMatch[1], 10) * 12;
  if (monthsMatch) totalMonths += parseInt(monthsMatch[1], 10);

  if (totalMonths === 0) return null;

  return Math.round((totalMonths / 12) * 10) / 10;
}

/**
 * Нормализует строку гражданства.
 * Возвращает: 'RU' | 'OTHER' | null
 */
export function normalizeCitizenship(raw) {
  if (!raw) return null;

  const str = raw.toLowerCase().trim();

  // Пробельная строка после trim → null
  if (!str) return null;

  if (
    str.includes('россия') ||
    str.includes('russia') ||
    str === 'ru' ||
    str === '113' // ID России в HH
  ) {
    return 'RU';
  }

  return 'OTHER';
}

/**
 * Задержка (для rate limiting между запросами)
 */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Безопасное усечение строки для Telegram (лимит 4096 символов на сообщение)
 */
export function truncate(str, maxLen = 200) {
  if (!str) return '';
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + '...';
}
