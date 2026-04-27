/**
 * habr-parser.js — чистые функции парсинга HTML с Хабр Карьеры
 *
 * Модуль намеренно НЕ импортирует config, logger, axios.
 * Принимает HTML-строку → возвращает данные.
 * Это делает функции тестируемыми без .env и HTTP.
 *
 * HTTP-слой и оркестрация — в habr.js.
 */

import * as cheerio from 'cheerio';

const BASE_URL = 'https://career.habr.com';

/**
 * CSS-селекторы Хабра — единственное место для обновления при смене вёрстки.
 * При изменении вёрстки Хабра обновлять только здесь, логика не меняется.
 */
export const SELECTORS = {
  // Страница списка откликов
  // Реальный Хабр: карточки — .response-item или элементы с data-id
  responseItem:   '.response-item, [data-response-id], [data-id]',
  // Ссылка на профиль кандидата: href вида /username?source=response&source_id=XXX
  // или старый формат /resumes/, /users/
  candidateLink:  'a[href*="source_id="], a[href*="/resumes/"], a[href*="/users/"], a[class*="name"]',
  vacancyTitle:   '[class*="position"], .vacancy-title, .job-title',
  dateEl:         'time[datetime], [class*="date"]',

  // Страница профиля Хабра (h1 = имя кандидата)
  position:       'h1.user-card__name, h1[class*="user-card"], h1[class*="name"], h1',
  location:       '.resume-header__location, [class*="location"]',
  experienceTotal:'[class*="total-experience"], [class*="experience-total"]',
  citizenshipKey: 'Гражданство',
};

/**
 * Парсит HTML страницы со списком откликов.
 *
 * Реальная структура (подтверждена через DevTools + скриншот кабинета):
 * - Каждая карточка содержит: имя, должность, ОПЫТ (лет), город, дату
 * - Гражданство в списке НЕ отображается — только при просмотре профиля
 * - external_id: data-id атрибут или source_id из href ссылки
 *
 * @param {string} html
 * @param {string} [pageUrl] — URL страницы (для application_url)
 * @returns {Array}
 */
export function parseResponsesHtml(html, pageUrl = '') {
  const $ = cheerio.load(html);
  const responses = [];

  $(SELECTORS.responseItem).each((_, el) => {
    const $el = $(el);

    const candidateLink = $el.find(SELECTORS.candidateLink).first();
    const rawHref = candidateLink.attr('href') || null;

    // --- ID отклика ---
    // Приоритет: source_id из href (надёжнее) → data-id → data-response-id
    let external_id = null;

    // 1. source_id из href: "/username?source=response&source_id=12345" (реальный Хабр)
    if (rawHref) {
      const sourceIdMatch = rawHref.match(/source_id=(\d+)/);
      if (sourceIdMatch) external_id = sourceIdMatch[1];
    }
    // 2. data-атрибуты как fallback
    if (!external_id) {
      external_id = $el.attr('data-response-id') || $el.attr('data-id') || null;
    }

    const candidate_url = rawHref || null;
    const candidate_name = candidateLink.text().trim() || null;

    // --- Должность ---
    const position = $el.find(SELECTORS.vacancyTitle).first().text().trim() || null;

    // --- Дата отклика ---
    const dateEl = $el.find(SELECTORS.dateEl).first();
    const received_at = dateEl.attr('datetime') || $el.find('[class*="date"]').first().text().trim() || new Date().toISOString();

    // --- Опыт работы (из карточки списка!) ---
    // Формат: "4 компании • 6 лет и 3 месяца" → берём часть после "•"
    let experience_raw = null;
    $el.find('[class*="section"], [class*="block"]').each((_, section) => {
      const $s = $(section);
      const label = $s.find('[class*="label"]').text().trim();
      if (label.includes('Опыт работы') || label.includes('Опыт')) {
        const val = $s.find('[class*="value"]').text().trim();
        // "3 компании • 3 года и 6 месяцев" → взять часть после "•"
        const parts = val.split('•');
        experience_raw = parts.length > 1 ? parts[parts.length - 1].trim() : val;
      }
    });

    // --- Город ---
    let location = null;
    $el.find('[class*="section"], [class*="block"]').each((_, section) => {
      const $s = $(section);
      const label = $s.find('[class*="label"]').text().trim();
      if (label.includes('Город') || label.includes('Локация')) {
        const val = $s.find('[class*="value"]').text().trim();
        // "Санкт-Петербург • Готов к удалённой работе" → только город
        location = val.split('•')[0].trim() || null;
      }
    });

    // Нужен хотя бы один идентификатор
    const id = external_id || candidate_url;
    if (!id) return;

    responses.push({
      external_id: String(id),
      candidate_name,
      candidate_url,
      position,           // должность из карточки
      experience_raw,     // опыт из карточки — не нужно идти на страницу резюме!
      location,           // город из карточки
      application_url: pageUrl,
      received_at,
    });
  });

  return responses;
}

/**
 * Парсит HTML страницы резюме кандидата на Хабр Карьере.
 *
 * Реальная структура страницы (подтверждена через DevTools):
 * - Гражданство/страна: "Местоположение: Россия, Москва" (НЕ поле "Гражданство"!)
 * - Опыт: "Стаж: 9 лет и 9 месяцев" (НЕ "Опыт работы")
 *
 * @param {string} html
 * @returns {{citizenship: string|null, experience_raw: string|null, position: string|null, location: string|null, cover_letter: null}}
 */
export function parseResumeHtml(html) {
  const $ = cheerio.load(html);
  const bodyText = $('body').text();

  // --- Должность (h1 с именем — берём из специализации) ---
  const position = $(SELECTORS.position).first().text().trim() || null;

  // --- Гражданство ---
  //
  // Реальные форматы Хабра (подтверждено через DevTools на нескольких профилях):
  // 1. "Гражданство: Россия"  (sidebar stats — самый точный!)
  // 2. "Местоположение: Россия, Москва" / "Местонахождение: Россия, СПб"
  //    → страна = первая часть до запятой
  // 3. "Проживание: Россия, Москва" (встречается в некоторых профилях)
  let citizenship = null;
  let location = null;

  // Стратегия 1: прямое поле "Гражданство:" (самое точное)
  const citizenshipMatch = bodyText.match(/Гражданство[:\s]+([^\n\r,]{2,50})/);
  if (citizenshipMatch) {
    citizenship = citizenshipMatch[1].trim() || null;
  }

  // Стратегия 2: "Местоположение:" или "Местонахождение:" (оба варианта встречаются в Хабре)
  const locationMatch = bodyText.match(/(?:Местоположение|Местонахождение)[:\s]+([А-Яа-яёЁA-Za-z][^\n\r]{2,80})/);
  if (locationMatch) {
    const full = locationMatch[1].trim().split('\n')[0].trim();
    location = full || null;
    if (!citizenship) citizenship = full.split(',')[0].trim() || null;
  }

  // Стратегия 3: "Проживание: Россия, Москва"
  if (!citizenship) {
    const m = bodyText.match(/Проживание[:\s]+([А-Яа-яёЁA-Za-z][^\n\r]{2,80})/);
    if (m) {
      const full = m[1].trim().split('\n')[0].trim();
      location = location || full;
      citizenship = full.split(',')[0].trim() || null;
    }
  }

  // --- Опыт работы ---
  //
  // Реальные форматы (по приоритету надёжности):
  // 1. "Опыт работы: 6 лет и 3 месяца" — sidebar профиля (самый точный!)
  // 2. "Стаж: 9 лет и 9 месяцев" — тоже в sidebar
  // 3. "более 9 лет" — в тексте "Обо мне"
  // 4. DOM-элемент total-experience
  let experience_raw = null;

  // Стратегия 1: "Опыт работы: X лет Y месяцев" (sidebar профиля)
  const expWorkMatch = bodyText.match(/Опыт работы[:\s]+([^\n\r]+)/i);
  if (expWorkMatch) experience_raw = expWorkMatch[1].trim();

  // Стратегия 2: "Стаж: X лет Y месяцев" (альтернативный label)
  if (!experience_raw) {
    const m = bodyText.match(/Стаж[:\s]+([^\n\r]+)/i);
    if (m) experience_raw = m[1].trim();
  }

  // Стратегия 3: "более/свыше X лет" в тексте "Обо мне"
  if (!experience_raw) {
    const m = bodyText.match(/(?:более|свыше|около)\s+(\d+)\s*(лет|года|год)/i);
    if (m) experience_raw = `${m[1]} ${m[2]}`;
  }

  // Стратегия 4: DOM-селектор
  if (!experience_raw) {
    const expEl = $(SELECTORS.experienceTotal).first();
    if (expEl.length) experience_raw = expEl.text().trim() || null;
  }

  return {
    citizenship:    citizenship || null,
    experience_raw: experience_raw || null,
    position:       position || null,
    location:       location || null,
    cover_letter:   null,
  };
}
