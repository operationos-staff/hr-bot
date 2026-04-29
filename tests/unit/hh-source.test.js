/**
 * TDD: src/sources/hh.js — getNewHHApplications + isHHEnabled
 *
 * Стратегия: DI через второй аргумент getNewHHApplications(isNew, deps).
 * Тестируем без реального axios — мокаем fetchNegotiations / fetchResume.
 *
 * Фокус:
 * - isHHEnabled() — false при пустых HH_EMPLOYER_ID/HH_ACCESS_TOKEN
 * - getNewHHApplications с отключённым HH → []
 * - getNewHHApplications с моками собирает нормализованные application
 * - dedup: isNew=false → пропускает
 * - сбой fetchResume не валит весь цикл (отклик идёт без resume-данных)
 * - поддержка HH_VACANCY_IDS — итерация по нескольким вакансиям
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isHHEnabled, getNewHHApplications } from '../../src/sources/hh.js';

// ============================================================
// isHHEnabled
// ============================================================
describe('isHHEnabled — текущее состояние .env', () => {
  test('false при пустых HH_EMPLOYER_ID/HH_ACCESS_TOKEN (Phase 1)', () => {
    // В .env сейчас HH_* пустые → false
    assert.equal(isHHEnabled(), false);
  });
});

// ============================================================
// getNewHHApplications — выключен
// ============================================================
describe('getNewHHApplications — HH отключён', () => {
  test('возвращает [] если isEnabled = false', async () => {
    const result = await getNewHHApplications(async () => true, {
      isEnabled: () => false,
      fetchNegotiations: async () => { throw new Error('должен НЕ дёргаться'); },
      fetchResume: async () => { throw new Error('должен НЕ дёргаться'); },
    });
    assert.deepEqual(result, []);
  });
});

// ============================================================
// getNewHHApplications — обычный сбор откликов
// ============================================================
describe('getNewHHApplications — мокированный сбор', () => {

  const NEG = {
    id: 7777,
    created_at: '2026-04-29T10:00:00+0300',
    message: 'отклик',
    alternate_url: 'https://hh.ru/negotiations/7777',
    vacancy: { id: '11', name: 'amoCRM специалист' },
    resume: { id: 'r1', first_name: 'Иван', last_name: 'Петров', alternate_url: 'https://hh.ru/resume/r1' },
  };
  const RESUME = {
    id: 'r1',
    title: 'amoCRM Specialist',
    citizenship: [{ id: '113', name: 'Россия' }],
    area: { name: 'Москва' },
    total_experience: { months: 84 },
  };

  test('собирает 1 отклик: нормализован, citizenship/exp/position проставлены', async () => {
    const isNew = async () => true;
    const result = await getNewHHApplications(isNew, {
      isEnabled: () => true,
      fetchNegotiations: async () => [NEG],
      fetchResume: async (id) => {
        assert.equal(id, 'r1');
        return RESUME;
      },
    });
    assert.equal(result.length, 1);
    const app = result[0];
    assert.equal(app.source, 'hh');
    assert.equal(app.external_id, '7777');
    assert.equal(app.candidate_name, 'Иван Петров');
    assert.equal(app.citizenship, 'Россия');
    assert.equal(app.experience_raw, 84);
    assert.equal(app.position, 'amoCRM Specialist');
    assert.equal(app.location, 'Москва');
    assert.equal(app.vacancy_title, 'amoCRM специалист');
  });

  test('пропускает уже существующие (isNew=false → не дёргает fetchResume)', async () => {
    let resumeFetched = 0;
    const result = await getNewHHApplications(async () => false, {
      isEnabled: () => true,
      fetchNegotiations: async () => [NEG],
      fetchResume: async () => { resumeFetched++; return RESUME; },
    });
    assert.deepEqual(result, []);
    assert.equal(resumeFetched, 0, 'fetchResume must NOT be called for existing applications');
  });

  test('сбой fetchResume не валит цикл (отклик добавляется без resume-данных)', async () => {
    const result = await getNewHHApplications(async () => true, {
      isEnabled: () => true,
      fetchNegotiations: async () => [NEG],
      fetchResume: async () => { throw new Error('hh resume 500'); },
    });
    assert.equal(result.length, 1);
    const app = result[0];
    assert.equal(app.external_id, '7777');
    assert.equal(app.citizenship, null); // данных резюме нет
    assert.equal(app.experience_raw, null);
  });

  test('сбой fetchNegotiations → возвращает [] (не throws — позволяет poller продолжить с Habr)', async () => {
    const result = await getNewHHApplications(async () => true, {
      isEnabled: () => true,
      fetchNegotiations: async () => { throw new Error('hh 401'); },
      fetchResume: async () => RESUME,
    });
    assert.deepEqual(result, []);
  });
});

// ============================================================
// getNewHHApplications — несколько вакансий (HH_VACANCY_IDS)
// ============================================================
describe('getNewHHApplications — несколько вакансий', () => {
  test('итерирует по списку vacancyIds, собирает отклики со всех', async () => {
    const calls = [];
    const negsByVacancy = {
      'V1': [{ id: 1, created_at: '2026-04-29T10:00:00+0300', message: null, vacancy: { name: 'V1' }, resume: { id: 'r1', first_name: 'A', last_name: 'B', alternate_url: 'u1' }, alternate_url: 'a1' }],
      'V2': [{ id: 2, created_at: '2026-04-29T10:00:00+0300', message: null, vacancy: { name: 'V2' }, resume: { id: 'r2', first_name: 'C', last_name: 'D', alternate_url: 'u2' }, alternate_url: 'a2' }],
    };
    const result = await getNewHHApplications(async () => true, {
      isEnabled: () => true,
      vacancyIds: ['V1', 'V2'],
      fetchNegotiations: async (vacancyId) => {
        calls.push(vacancyId);
        return negsByVacancy[vacancyId] || [];
      },
      fetchResume: async (id) => ({ id, citizenship: [], area: { name: 'X' }, total_experience: { months: 60 } }),
    });
    assert.deepEqual(calls, ['V1', 'V2']);
    assert.equal(result.length, 2);
    assert.deepEqual(result.map(r => r.external_id).sort(), ['1', '2']);
  });

  test('пустой vacancyIds — один общий запрос без vacancy_id', async () => {
    const calls = [];
    await getNewHHApplications(async () => true, {
      isEnabled: () => true,
      vacancyIds: [],
      fetchNegotiations: async (vacancyId) => {
        calls.push(vacancyId);
        return [];
      },
      fetchResume: async () => ({}),
    });
    // Один вызов с null/undefined как vacancy_id (employer-wide)
    assert.equal(calls.length, 1);
    assert.ok(calls[0] === null || calls[0] === undefined, 'expected null/undefined vacancyId for employer-wide query');
  });
});
