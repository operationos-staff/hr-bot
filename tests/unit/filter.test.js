/**
 * TDD: src/services/filter.js
 *
 * Таблица решений из TECH_SPEC.md Модуль 3 — строгое покрытие всех 7 комбинаций.
 * Граничные условия: опыт ровно 5.0, 4.9, оба null.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { filterApplication } from '../../src/services/filter.js';

// ============================================================
// Хелпер для формирования входного объекта
// ============================================================
function makeCandidate({ citizenship = null, experience_raw = null } = {}) {
  return { citizenship, experience_raw };
}

// ============================================================
// Таблица решений (7 строк из TECH_SPEC.md)
// ============================================================

describe('filterApplication — таблица решений', () => {

  // 1. RU + ≥5 → ✅
  test('citizenship=РФ + опыт ≥5 лет → qualified=true', () => {
    const result = filterApplication(makeCandidate({ citizenship: 'Россия', experience_raw: '7 лет' }));
    assert.equal(result.qualified, true);
    assert.equal(result.citizenship, 'RU');
    assert.equal(result.filter_reason, null);
  });

  // 2. RU + <5 → ❌
  test('citizenship=РФ + опыт <5 лет → qualified=false', () => {
    const result = filterApplication(makeCandidate({ citizenship: 'Россия', experience_raw: '3 года' }));
    assert.equal(result.qualified, false);
    assert.equal(result.citizenship, 'RU');
    assert.ok(result.filter_reason?.includes('3'));
  });

  // 3. RU + null опыт → 🟡
  test('citizenship=РФ + опыт не указан → qualified=null (🟡)', () => {
    const result = filterApplication(makeCandidate({ citizenship: 'Россия', experience_raw: null }));
    assert.equal(result.qualified, null);
    assert.equal(result.citizenship, 'RU');
    assert.ok(result.filter_reason?.includes('опыт'));
  });

  // 4. OTHER + любой → ❌
  test('citizenship=Казахстан (OTHER) + опыт 7 лет → qualified=false', () => {
    const result = filterApplication(makeCandidate({ citizenship: 'Казахстан', experience_raw: '7 лет' }));
    assert.equal(result.qualified, false);
    assert.equal(result.citizenship, 'OTHER');
  });

  test('citizenship=OTHER + опыт null → qualified=false (достаточно одного ❌)', () => {
    const result = filterApplication(makeCandidate({ citizenship: 'Украина', experience_raw: null }));
    assert.equal(result.qualified, false);
  });

  // 5. null гражданство + ≥5 → 🟡
  test('citizenship=не указано + опыт ≥5 лет → qualified=null (🟡)', () => {
    const result = filterApplication(makeCandidate({ citizenship: null, experience_raw: '6 лет' }));
    assert.equal(result.qualified, null);
    assert.equal(result.citizenship, null);
    assert.ok(result.filter_reason?.includes('гражданство'));
  });

  // 6. null гражданство + <5 → ❌
  test('citizenship=не указано + опыт <5 лет → qualified=false', () => {
    const result = filterApplication(makeCandidate({ citizenship: null, experience_raw: '2 года' }));
    assert.equal(result.qualified, false);
  });

  // 7. null + null → 🟡
  test('citizenship=не указано + опыт=не указан → qualified=null (🟡)', () => {
    const result = filterApplication(makeCandidate({ citizenship: null, experience_raw: null }));
    assert.equal(result.qualified, null);
    assert.ok(result.filter_reason?.includes('гражданство'));
    assert.ok(result.filter_reason?.includes('опыт'));
  });
});

// ============================================================
// Граничные условия
// ============================================================

describe('filterApplication — граничные условия', () => {

  test('опыт ровно 5.0 лет → qualified=true (граница включительно)', () => {
    const result = filterApplication(makeCandidate({ citizenship: 'Россия', experience_raw: '5 лет' }));
    assert.equal(result.qualified, true);
    assert.equal(result.experience_years, 5.0);
  });

  test('опыт 4.9 лет (59 мес из HH) → qualified=false', () => {
    const result = filterApplication(makeCandidate({ citizenship: 'Россия', experience_raw: 59 }));
    assert.equal(result.qualified, false);
    assert.equal(result.experience_years, 4.9);
  });

  test('опыт "менее года" → qualified=false (0.5 < 5)', () => {
    const result = filterApplication(makeCandidate({ citizenship: 'Россия', experience_raw: 'менее года' }));
    assert.equal(result.qualified, false);
    assert.equal(result.experience_years, 0.5);
  });

  test('опыт через HH API (число месяцев = 84) → qualified=true', () => {
    const result = filterApplication(makeCandidate({ citizenship: 'Россия', experience_raw: 84 }));
    assert.equal(result.qualified, true);
    assert.equal(result.experience_years, 7.0);
  });

  test('citizenship HH ID "113" → RU → qualified корректно', () => {
    const result = filterApplication(makeCandidate({ citizenship: '113', experience_raw: '6 лет' }));
    assert.equal(result.citizenship, 'RU');
    assert.equal(result.qualified, true);
  });
});

// ============================================================
// Структура возвращаемого объекта
// ============================================================

describe('filterApplication — структура результата', () => {

  test('возвращает все обязательные поля', () => {
    const result = filterApplication(makeCandidate({ citizenship: 'Россия', experience_raw: '5 лет' }));
    assert.ok('qualified' in result);
    assert.ok('filter_reason' in result);
    assert.ok('citizenship' in result);
    assert.ok('experience_years' in result);
  });

  test('qualified никогда не undefined', () => {
    const cases = [
      makeCandidate({ citizenship: 'Россия', experience_raw: '5 лет' }),
      makeCandidate({ citizenship: 'Казахстан', experience_raw: '5 лет' }),
      makeCandidate({ citizenship: null, experience_raw: null }),
    ];
    for (const c of cases) {
      const result = filterApplication(c);
      assert.notEqual(result.qualified, undefined, `qualified is undefined for: ${JSON.stringify(c)}`);
    }
  });

  test('experience_years никогда не undefined', () => {
    const result = filterApplication(makeCandidate({ citizenship: null, experience_raw: null }));
    assert.notEqual(result.experience_years, undefined);
    assert.equal(result.experience_years, null); // null, не undefined
  });

  test('filter_reason = null при qualified=true', () => {
    const result = filterApplication(makeCandidate({ citizenship: 'Россия', experience_raw: '6 лет' }));
    assert.equal(result.filter_reason, null);
  });

  test('filter_reason присутствует при qualified=false', () => {
    const result = filterApplication(makeCandidate({ citizenship: 'Казахстан', experience_raw: '6 лет' }));
    assert.ok(typeof result.filter_reason === 'string');
    assert.ok(result.filter_reason.length > 0);
  });
});
