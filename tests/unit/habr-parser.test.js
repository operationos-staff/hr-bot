/**
 * TDD: src/sources/habr.js — парсинг HTML
 *
 * Стратегия: тестируем чистую логику парсинга через внутренние функции.
 * HTTP-запросы не делаем — используем HTML-фикстуры из tests/fixtures/.
 *
 * Что тестируем:
 * - parseResumeHtml(html) — извлечение полей из страницы резюме
 * - parseResponsesHtml(html) — извлечение списка откликов
 * - Корректная обработка отсутствующих полей (null, не undefined)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Загружаем фикстуры
const __dir = dirname(fileURLToPath(import.meta.url));
const fixtures = join(__dir, '../fixtures');

const htmlResumeRU      = readFileSync(join(fixtures, 'habr-resume-ru.html'), 'utf8');
const htmlResumeOther   = readFileSync(join(fixtures, 'habr-resume-other.html'), 'utf8');
const htmlResumeEmpty   = readFileSync(join(fixtures, 'habr-resume-empty.html'), 'utf8');
const htmlResumeOboMne  = readFileSync(join(fixtures, 'habr-resume-obo-mne.html'), 'utf8');
const htmlResponsesPage = readFileSync(join(fixtures, 'habr-responses-page.html'), 'utf8');

// Чистые функции парсинга — без config, без HTTP, только cheerio
// Разделены в отдельный модуль для тестируемости
import { parseResumeHtml, parseResponsesHtml } from '../../src/sources/habr-parser.js';

// ============================================================
// parseResumeHtml — парсинг страницы резюме
// ============================================================

describe('parseResumeHtml — профиль с Гражданство + Опыт работы в sidebar (реальный Хабр)', () => {
  test('не бросает ошибку', () => {
    assert.ok(parseResumeHtml(htmlResumeRU));
  });

  test('citizenship = "Россия" (из прямого поля "Гражданство:")', () => {
    const r = parseResumeHtml(htmlResumeRU);
    assert.equal(r.citizenship, 'Россия');
  });

  test('experience_raw = "6 лет и 3 месяца" (из поля "Опыт работы:")', () => {
    const r = parseResumeHtml(htmlResumeRU);
    assert.equal(r.experience_raw, '6 лет и 3 месяца');
  });

  test('location содержит "Россия" и "Санкт-Петербург"', () => {
    const r = parseResumeHtml(htmlResumeRU);
    assert.ok(r.location?.includes('Россия'), `location="${r.location}"`);
    assert.ok(r.location?.includes('Санкт-Петербург'), `location="${r.location}"`);
  });

  test('position = "Виталий Шерстобитов" (h1)', () => {
    const r = parseResumeHtml(htmlResumeRU);
    assert.equal(r.position, 'Виталий Шерстобитов');
  });
});

describe('parseResumeHtml — резюме иностранного гражданина', () => {
  test('citizenship = "Казахстан" (из "Местонахождение: Казахстан, Алматы")', () => {
    const r = parseResumeHtml(htmlResumeOther);
    assert.equal(r.citizenship, 'Казахстан');
  });

  test('experience_raw = "8 лет"', () => {
    const r = parseResumeHtml(htmlResumeOther);
    assert.equal(r.experience_raw, '8 лет');
  });

  test('location содержит "Казахстан"', () => {
    const r = parseResumeHtml(htmlResumeOther);
    assert.ok(r.location?.includes('Казахстан'), `location="${r.location}"`);
  });
});

describe('parseResumeHtml — резюме без данных (пустые поля)', () => {
  test('citizenship = null (не undefined, не пустая строка)', () => {
    const r = parseResumeHtml(htmlResumeEmpty);
    assert.equal(r.citizenship, null);
    assert.notEqual(r.citizenship, undefined);
    assert.notEqual(r.citizenship, '');
  });

  test('experience_raw = null', () => {
    const r = parseResumeHtml(htmlResumeEmpty);
    assert.equal(r.experience_raw, null);
  });

  test('location = null (нет блока)', () => {
    const r = parseResumeHtml(htmlResumeEmpty);
    assert.equal(r.location, null);
  });

  test('position = "Frontend Developer" (есть в h1)', () => {
    const r = parseResumeHtml(htmlResumeEmpty);
    assert.equal(r.position, 'Frontend Developer');
  });

  test('возвращает объект, все поля присутствуют', () => {
    const r = parseResumeHtml(htmlResumeEmpty);
    assert.ok('citizenship' in r);
    assert.ok('experience_raw' in r);
    assert.ok('position' in r);
    assert.ok('location' in r);
  });
});

// ============================================================
// parseResumeHtml — fallback через "Обо мне" (Стаж не виден)
// ============================================================

describe('parseResumeHtml — опыт из блока "Обо мне" (Стаж не загружен)', () => {
  test('citizenship = "Россия" (из Местоположение)', () => {
    const r = parseResumeHtml(htmlResumeOboMne);
    assert.equal(r.citizenship, 'Россия');
  });

  test('experience_raw извлекается из "более 6 лет" в тексте', () => {
    const r = parseResumeHtml(htmlResumeOboMne);
    // Стратегия 2: "более 6 лет" → experience_raw = "6 лет"
    assert.ok(r.experience_raw, 'experience_raw should not be null');
    assert.ok(r.experience_raw.includes('6'), `expected "6" in "${r.experience_raw}"`);
  });
});

// ============================================================
// parseResponsesHtml — парсинг страницы со списком откликов
// ============================================================

describe('parseResponsesHtml — список откликов (реальная структура Хабра)', () => {
  test('находит 3 отклика на тестовой странице', () => {
    const responses = parseResponsesHtml(htmlResponsesPage);
    assert.equal(responses.length, 3);
  });

  test('первый отклик: external_id = "4509100" (source_id из href)', () => {
    const responses = parseResponsesHtml(htmlResponsesPage);
    assert.equal(responses[0].external_id, '4509100');
  });

  test('первый отклик: candidate_name = "Виталий Шерстобитов"', () => {
    const responses = parseResponsesHtml(htmlResponsesPage);
    assert.equal(responses[0].candidate_name, 'Виталий Шерстобитов');
  });

  test('первый отклик: candidate_url содержит source_id', () => {
    const responses = parseResponsesHtml(htmlResponsesPage);
    assert.ok(responses[0].candidate_url?.includes('source_id='));
  });

  test('первый отклик: experience_raw = "6 лет и 3 месяца" (из карточки!)', () => {
    const responses = parseResponsesHtml(htmlResponsesPage);
    assert.equal(responses[0].experience_raw, '6 лет и 3 месяца');
  });

  test('первый отклик: location = "Санкт-Петербург"', () => {
    const responses = parseResponsesHtml(htmlResponsesPage);
    assert.equal(responses[0].location, 'Санкт-Петербург');
  });

  test('второй отклик: experience_raw = "3 года и 6 месяцев" (< 5 лет → ❌)', () => {
    const responses = parseResponsesHtml(htmlResponsesPage);
    assert.equal(responses[1].experience_raw, '3 года и 6 месяцев');
  });

  test('все отклики имеют обязательные поля', () => {
    const responses = parseResponsesHtml(htmlResponsesPage);
    for (const r of responses) {
      assert.ok('external_id' in r, 'missing external_id');
      assert.ok('candidate_name' in r, 'missing candidate_name');
      assert.ok('candidate_url' in r, 'missing candidate_url');
      assert.ok('experience_raw' in r, 'missing experience_raw');
      assert.ok('location' in r, 'missing location');
    }
  });

  test('пустая страница → возвращает []', () => {
    const responses = parseResponsesHtml('<html><body><div>Нет откликов</div></body></html>');
    assert.equal(responses.length, 0);
    assert.ok(Array.isArray(responses));
  });
});
