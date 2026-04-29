/**
 * TDD: src/sources/habr.js — normalizeHabrResponse
 *
 * Фикстуры построены на РЕАЛЬНЫХ данных из API:
 * GET /api/frontend/vacancies/1000164921/responses?page=1
 * Получено через DevTools 27.04.2026
 *
 * API endpoint: https://career.habr.com/api/frontend/vacancies/{id}/responses?page={n}
 * Структура: { list: [{response: {...}}, ...], meta: {...} }
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
// Импортируем из чистого модуля без config/axios зависимостей
import { normalizeHabrResponse } from '../../src/sources/habr-normalizer.js';

// ============================================================
// Фикстуры — реальные данные из API (упрощённые)
// ============================================================

const FIXTURE_RU = {
  response: {
    id: 4509015,
    publishedAt: { title: '27 апреля 2026 в 12:02', date: '2026-04-27T12:02:55+03:00' },
    message: null,
    author: {
      id: 'the-ash',
      title: 'Антон Шанауров',
      href: '/the-ash?source=response&source_id=4509015',
      location: { title: 'Москва', href: '/resumes?locations[]=c_678' },
      salary: { title: 'От 220 000 ₽', value: 220000, currency: 'rur' },
      experience: { title: '9 лет и 9 месяцев', value: 117 }, // value = месяцы!
      citizenships: [], // не заполнил — частый случай
      specializations: [{ title: 'Бэкенд разработчик' }, { title: 'Веб-разработчик' }],
      lastJob: { position: 'Старший бэкенд разработчик', company: { title: 'Металлинвестбанк' } },
      qualification: { title: 'Senior', value: 5 },
      age: { value: 35, title: '35 лет' },
    },
  },
};

const FIXTURE_RU_WITH_CITIZENSHIP = {
  response: {
    id: 4508288,
    publishedAt: { title: '26 апреля 2026 в 23:07', date: '2026-04-26T23:07:00+03:00' },
    message: 'Готов рассмотреть предложение',
    author: {
      id: 'xxx2coder',
      title: 'Виталий Шерстобитов',
      href: '/xxx2coder?source=response&source_id=4508288',
      location: { title: 'Санкт-Петербург' },
      experience: { title: '6 лет и 3 месяца', value: 75 },
      citizenships: [{ title: 'Россия', href: '' }], // заполнил!
      specializations: [{ title: 'Бэкенд разработчик' }],
      lastJob: { position: 'Team Lead (Backend)', company: { title: 'Hpace' } },
      qualification: { title: 'Senior', value: 5 },
    },
  },
};

const FIXTURE_OTHER_CITIZENSHIP = {
  response: {
    id: 4508100,
    publishedAt: { date: '2026-04-26T23:52:00+03:00' },
    message: null,
    author: {
      id: 'ramazon',
      title: 'Ramazon Makhmudov',
      href: '/ramazon?source=response&source_id=4508100',
      location: { title: 'Москва' },
      experience: { title: '3 года и 6 месяцев', value: 42 },
      citizenships: [{ title: 'Таджикистан', href: '' }], // OTHER → ❌
      specializations: [{ title: 'Бэкенд разработчик' }],
      lastJob: null,
      qualification: { title: 'Middle', value: 3 },
    },
  },
};

const FIXTURE_NO_EXPERIENCE = {
  response: {
    id: 4507000,
    publishedAt: { date: '2026-04-26T21:00:00+03:00' },
    message: null,
    author: {
      id: 'noexp',
      title: 'Новый кандидат',
      href: '/noexp?source=response&source_id=4507000',
      location: null,
      experience: null, // нет опыта
      citizenships: [],
      specializations: [],
      lastJob: null,
      qualification: null,
    },
  },
};

// ============================================================
// Тесты normalizeHabrResponse
// ============================================================

describe('normalizeHabrResponse — базовые поля', () => {
  test('source всегда = "habr"', () => {
    const r = normalizeHabrResponse(FIXTURE_RU);
    assert.equal(r.source, 'habr');
  });

  test('external_id = String(response.id)', () => {
    const r = normalizeHabrResponse(FIXTURE_RU);
    assert.equal(r.external_id, '4509015');
    assert.equal(typeof r.external_id, 'string'); // всегда строка!
  });

  test('candidate_name из author.title', () => {
    const r = normalizeHabrResponse(FIXTURE_RU);
    assert.equal(r.candidate_name, 'Антон Шанауров');
  });

  test('candidate_url содержит полный URL с source_id', () => {
    const r = normalizeHabrResponse(FIXTURE_RU);
    assert.ok(r.candidate_url?.includes('the-ash'));
    assert.ok(r.candidate_url?.includes('source_id=4509015'));
  });

  test('received_at = ISO дата из publishedAt.date', () => {
    const r = normalizeHabrResponse(FIXTURE_RU);
    assert.equal(r.received_at, '2026-04-27T12:02:55+03:00');
  });

  test('cover_letter = null если message null', () => {
    const r = normalizeHabrResponse(FIXTURE_RU);
    assert.equal(r.cover_letter, null);
  });

  test('cover_letter из message если есть', () => {
    const r = normalizeHabrResponse(FIXTURE_RU_WITH_CITIZENSHIP);
    assert.equal(r.cover_letter, 'Готов рассмотреть предложение');
  });

  test('location = city из author.location.title', () => {
    const r = normalizeHabrResponse(FIXTURE_RU);
    assert.equal(r.location, 'Москва');
  });
});

describe('normalizeHabrResponse — опыт (experience_raw)', () => {
  test('experience_raw = число месяцев (117 для 9 лет 9 мес)', () => {
    const r = normalizeHabrResponse(FIXTURE_RU);
    assert.equal(r.experience_raw, 117); // число, не строка!
  });

  test('experience_raw = 75 (6 лет 3 мес)', () => {
    const r = normalizeHabrResponse(FIXTURE_RU_WITH_CITIZENSHIP);
    assert.equal(r.experience_raw, 75);
  });

  test('experience_raw = 42 (3 года 6 мес, < 5 лет → ❌)', () => {
    const r = normalizeHabrResponse(FIXTURE_OTHER_CITIZENSHIP);
    assert.equal(r.experience_raw, 42);
  });

  test('experience_raw = null если author.experience null', () => {
    const r = normalizeHabrResponse(FIXTURE_NO_EXPERIENCE);
    assert.equal(r.experience_raw, null);
  });
});

describe('normalizeHabrResponse — гражданство (citizenship)', () => {
  test('citizenship = null если citizenships = [] (частый случай!)', () => {
    const r = normalizeHabrResponse(FIXTURE_RU);
    assert.equal(r.citizenship, null); // 🟡
  });

  test('citizenship = "Россия" если citizenships = [{title: "Россия"}]', () => {
    const r = normalizeHabrResponse(FIXTURE_RU_WITH_CITIZENSHIP);
    assert.equal(r.citizenship, 'Россия');
  });

  test('citizenship = "Таджикистан" → normalizeCitizenship вернёт OTHER → ❌', () => {
    const r = normalizeHabrResponse(FIXTURE_OTHER_CITIZENSHIP);
    assert.equal(r.citizenship, 'Таджикистан');
  });
});

describe('normalizeHabrResponse — должность (position)', () => {
  test('position из lastJob.position (приоритет)', () => {
    const r = normalizeHabrResponse(FIXTURE_RU);
    assert.equal(r.position, 'Старший бэкенд разработчик');
  });

  test('position из specializations[0] если нет lastJob', () => {
    const r = normalizeHabrResponse(FIXTURE_OTHER_CITIZENSHIP);
    assert.equal(r.position, 'Бэкенд разработчик');
  });

  test('position = null если нет ни lastJob ни specializations', () => {
    const r = normalizeHabrResponse(FIXTURE_NO_EXPERIENCE);
    assert.equal(r.position, null);
  });
});

describe('normalizeHabrResponse — vacancy_external_id (D3)', () => {
  test('vacancy_external_id = строка, если vacancyId передан', () => {
    const r = normalizeHabrResponse(FIXTURE_RU, 'PHP-вакансия', '1000164921');
    assert.equal(r.vacancy_external_id, '1000164921');
    assert.equal(typeof r.vacancy_external_id, 'string');
  });

  test('vacancy_external_id = null если vacancyId не передан', () => {
    const r = normalizeHabrResponse(FIXTURE_RU);
    assert.equal(r.vacancy_external_id, null);
  });

  test('vacancyId число → приводится к строке', () => {
    const r = normalizeHabrResponse(FIXTURE_RU, null, 1000164921);
    assert.equal(r.vacancy_external_id, '1000164921');
  });
});

describe('normalizeHabrResponse — целостность структуры', () => {
  test('все обязательные поля присутствуют', () => {
    const r = normalizeHabrResponse(FIXTURE_RU);
    const required = ['source', 'external_id', 'candidate_name', 'candidate_url',
      'location', 'citizenship', 'experience_raw', 'cover_letter',
      'received_at', 'position', 'raw_data', 'vacancy_external_id'];
    for (const field of required) {
      assert.ok(field in r, `missing field: ${field}`);
    }
  });

  test('external_id всегда строка (не число)', () => {
    const r = normalizeHabrResponse(FIXTURE_RU);
    assert.equal(typeof r.external_id, 'string');
  });

  test('нет undefined значений — только null', () => {
    const r = normalizeHabrResponse(FIXTURE_NO_EXPERIENCE);
    for (const [key, val] of Object.entries(r)) {
      assert.notEqual(val, undefined, `field "${key}" is undefined, expected null`);
    }
  });
});
