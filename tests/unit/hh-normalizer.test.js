/**
 * TDD: src/sources/hh-normalizer.js
 *
 * Чистые pure-функции нормализации ответов HH API в формат application
 * для poller.processApplication.
 *
 * API endpoints (employer mode):
 * - GET /negotiations/employer?employer_id=...&vacancy_id=...&per_page=50
 * - GET /resumes/{id}
 *
 * Документация: https://api.hh.ru/openapi/redoc
 *
 * Принципы:
 * - external_id всегда String
 * - experience_raw — число месяцев (parseExperienceYears уже умеет это)
 * - citizenship — строка из API (нормализация в RU/OTHER в filter.js)
 * - все отсутствующие поля = null, никогда undefined
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHHResume,
  normalizeHHNegotiation,
} from '../../src/sources/hh-normalizer.js';

// ============================================================
// Фикстуры — реальная форма ответов HH API
// ============================================================

const RESUME_RU = {
  id: 'abc-123',
  first_name: 'Иван',
  last_name: 'Петров',
  middle_name: 'Сергеевич',
  title: 'Технический специалист по amoCRM',
  alternate_url: 'https://hh.ru/resume/abc-123',
  citizenship: [{ id: '113', name: 'Россия' }],
  area: { id: '1', name: 'Москва' },
  total_experience: { months: 84 }, // 7 лет
  experience: [
    { position: 'CRM-специалист', company: 'Острова Сокровищ' },
    { position: 'Junior dev', company: 'Acme' },
  ],
};

const RESUME_NO_TITLE = {
  id: 'def-456',
  first_name: 'Анна',
  last_name: 'Иванова',
  title: '', // пустая
  alternate_url: 'https://hh.ru/resume/def-456',
  citizenship: [],
  area: { name: 'Санкт-Петербург' },
  total_experience: { months: 60 },
  experience: [{ position: 'amoCRM-developer', company: 'X' }],
};

const RESUME_EMPTY = {
  id: 'empty',
  first_name: 'Новый',
  last_name: 'Кандидат',
  alternate_url: 'https://hh.ru/resume/empty',
  // нет citizenship, area, experience, title, total_experience
};

const RESUME_OTHER_CITIZENSHIP = {
  id: 'kz',
  first_name: 'Айбек',
  last_name: 'Алиев',
  title: 'amoCRM',
  alternate_url: 'https://hh.ru/resume/kz',
  citizenship: [{ id: '40', name: 'Казахстан' }],
  area: { name: 'Алматы' },
  total_experience: { months: 36 },
};

// neg = item из /negotiations/employer.items
const NEG_RU = {
  id: 1234567,
  created_at: '2026-04-29T10:00:00+0300',
  updated_at: '2026-04-29T10:00:00+0300',
  message: 'Здравствуйте, заинтересовала вакансия',
  state: { id: 'response', name: 'Отклик' },
  alternate_url: 'https://hh.ru/negotiations/1234567',
  vacancy: {
    id: '999000111',
    name: 'Технический специалист (amoCRM / автоматизации)',
    alternate_url: 'https://hh.ru/vacancy/999000111',
  },
  resume: {
    id: RESUME_RU.id,
    first_name: 'Иван',
    last_name: 'Петров',
    alternate_url: 'https://hh.ru/resume/abc-123',
  },
};

const NEG_NO_MESSAGE = {
  id: 1234568,
  created_at: '2026-04-29T11:00:00+0300',
  message: null,
  alternate_url: 'https://hh.ru/negotiations/1234568',
  vacancy: { name: 'amoCRM-спец' },
  resume: {
    id: 'def-456',
    first_name: 'Анна',
    last_name: 'Иванова',
    alternate_url: 'https://hh.ru/resume/def-456',
  },
};

// ============================================================
// normalizeHHResume
// ============================================================
describe('normalizeHHResume — citizenship', () => {
  test('массив с одним элементом → name первого', () => {
    const r = normalizeHHResume(RESUME_RU);
    assert.equal(r.citizenship, 'Россия');
  });

  test('пустой массив → null (типичный случай)', () => {
    const r = normalizeHHResume(RESUME_NO_TITLE);
    assert.equal(r.citizenship, null);
  });

  test('нет поля citizenship → null', () => {
    const r = normalizeHHResume(RESUME_EMPTY);
    assert.equal(r.citizenship, null);
  });

  test('citizenship → "Казахстан" (для filter.js нормализации в OTHER)', () => {
    const r = normalizeHHResume(RESUME_OTHER_CITIZENSHIP);
    assert.equal(r.citizenship, 'Казахстан');
  });
});

describe('normalizeHHResume — experience_raw', () => {
  test('total_experience.months → число (84)', () => {
    const r = normalizeHHResume(RESUME_RU);
    assert.equal(r.experience_raw, 84);
    assert.equal(typeof r.experience_raw, 'number');
  });

  test('60 месяцев — граница 5 лет', () => {
    const r = normalizeHHResume(RESUME_NO_TITLE);
    assert.equal(r.experience_raw, 60);
  });

  test('total_experience отсутствует → null', () => {
    const r = normalizeHHResume(RESUME_EMPTY);
    assert.equal(r.experience_raw, null);
  });
});

describe('normalizeHHResume — position', () => {
  test('title (приоритет) → "Технический специалист по amoCRM"', () => {
    const r = normalizeHHResume(RESUME_RU);
    assert.equal(r.position, 'Технический специалист по amoCRM');
  });

  test('title пустой → fallback на experience[0].position', () => {
    const r = normalizeHHResume(RESUME_NO_TITLE);
    assert.equal(r.position, 'amoCRM-developer');
  });

  test('нет ни title ни experience → null', () => {
    const r = normalizeHHResume(RESUME_EMPTY);
    assert.equal(r.position, null);
  });
});

describe('normalizeHHResume — location', () => {
  test('area.name → "Москва"', () => {
    const r = normalizeHHResume(RESUME_RU);
    assert.equal(r.location, 'Москва');
  });

  test('area отсутствует → null', () => {
    const r = normalizeHHResume(RESUME_EMPTY);
    assert.equal(r.location, null);
  });
});

describe('normalizeHHResume — структура', () => {
  test('всегда возвращает все 4 поля', () => {
    const r = normalizeHHResume(RESUME_EMPTY);
    for (const key of ['citizenship', 'experience_raw', 'position', 'location']) {
      assert.ok(key in r, `missing ${key}`);
    }
  });

  test('null вместо undefined', () => {
    const r = normalizeHHResume(RESUME_EMPTY);
    for (const [k, v] of Object.entries(r)) {
      assert.notEqual(v, undefined, `${k} is undefined`);
    }
  });

  test('null-вход → объект с null-полями (не throws)', () => {
    const r = normalizeHHResume(null);
    assert.equal(r.citizenship, null);
    assert.equal(r.experience_raw, null);
    assert.equal(r.position, null);
    assert.equal(r.location, null);
  });
});

// ============================================================
// normalizeHHNegotiation
// ============================================================
describe('normalizeHHNegotiation — базовые поля', () => {
  test('source всегда = "hh"', () => {
    const app = normalizeHHNegotiation(NEG_RU, RESUME_RU);
    assert.equal(app.source, 'hh');
  });

  test('external_id = String(neg.id)', () => {
    const app = normalizeHHNegotiation(NEG_RU, RESUME_RU);
    assert.equal(app.external_id, '1234567');
    assert.equal(typeof app.external_id, 'string');
  });

  test('candidate_name = first_name + last_name (trim)', () => {
    const app = normalizeHHNegotiation(NEG_RU, RESUME_RU);
    assert.equal(app.candidate_name, 'Иван Петров');
  });

  test('candidate_name = "Имя не указано" если нет first_name', () => {
    const neg = { ...NEG_RU, resume: { ...NEG_RU.resume, first_name: null, last_name: null } };
    const app = normalizeHHNegotiation(neg, RESUME_RU);
    assert.equal(app.candidate_name, 'Имя не указано');
  });

  test('candidate_url = resume.alternate_url', () => {
    const app = normalizeHHNegotiation(NEG_RU, RESUME_RU);
    assert.equal(app.candidate_url, 'https://hh.ru/resume/abc-123');
  });

  test('application_url = neg.alternate_url', () => {
    const app = normalizeHHNegotiation(NEG_RU, RESUME_RU);
    assert.equal(app.application_url, 'https://hh.ru/negotiations/1234567');
  });

  test('vacancy_title из neg.vacancy.name', () => {
    const app = normalizeHHNegotiation(NEG_RU, RESUME_RU);
    assert.equal(app.vacancy_title, 'Технический специалист (amoCRM / автоматизации)');
  });

  test('cover_letter из neg.message', () => {
    const app = normalizeHHNegotiation(NEG_RU, RESUME_RU);
    assert.equal(app.cover_letter, 'Здравствуйте, заинтересовала вакансия');
  });

  test('cover_letter = null если message null', () => {
    const app = normalizeHHNegotiation(NEG_NO_MESSAGE, RESUME_NO_TITLE);
    assert.equal(app.cover_letter, null);
  });

  test('received_at = neg.created_at', () => {
    const app = normalizeHHNegotiation(NEG_RU, RESUME_RU);
    assert.equal(app.received_at, '2026-04-29T10:00:00+0300');
  });
});

describe('normalizeHHNegotiation — мерж resumeData', () => {
  test('citizenship из resume → "Россия"', () => {
    const app = normalizeHHNegotiation(NEG_RU, RESUME_RU);
    assert.equal(app.citizenship, 'Россия');
  });

  test('experience_raw из resume → 84 (месяцы)', () => {
    const app = normalizeHHNegotiation(NEG_RU, RESUME_RU);
    assert.equal(app.experience_raw, 84);
  });

  test('position из resume.title', () => {
    const app = normalizeHHNegotiation(NEG_RU, RESUME_RU);
    assert.equal(app.position, 'Технический специалист по amoCRM');
  });

  test('location из resume.area.name', () => {
    const app = normalizeHHNegotiation(NEG_RU, RESUME_RU);
    assert.equal(app.location, 'Москва');
  });

  test('resumeData = null → все поля резюме = null, не throws', () => {
    const app = normalizeHHNegotiation(NEG_RU, null);
    assert.equal(app.citizenship, null);
    assert.equal(app.experience_raw, null);
    assert.equal(app.position, null);
    assert.equal(app.location, null);
  });
});

describe('normalizeHHNegotiation — целостность', () => {
  test('все обязательные поля присутствуют', () => {
    const app = normalizeHHNegotiation(NEG_RU, RESUME_RU);
    const required = [
      'source', 'external_id', 'candidate_name', 'candidate_url',
      'application_url', 'vacancy_title', 'location', 'citizenship',
      'experience_raw', 'cover_letter', 'received_at', 'position', 'raw_data',
    ];
    for (const f of required) {
      assert.ok(f in app, `missing ${f}`);
    }
  });

  test('нет undefined значений — только null', () => {
    const app = normalizeHHNegotiation(NEG_NO_MESSAGE, RESUME_EMPTY);
    for (const [k, v] of Object.entries(app)) {
      assert.notEqual(v, undefined, `field "${k}" is undefined`);
    }
  });

  test('raw_data содержит neg и resumeData (для дебага)', () => {
    const app = normalizeHHNegotiation(NEG_RU, RESUME_RU);
    assert.ok(app.raw_data);
    assert.ok('neg' in app.raw_data);
    assert.ok('resume' in app.raw_data);
  });
});
