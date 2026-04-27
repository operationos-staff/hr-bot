/**
 * TDD: src/utils/helpers.js
 *
 * Тесты написаны по TECH_SPEC.md Модуль 3 (нормализация) и Модуль 1/2 (парсинг опыта).
 * Каждый кейс — отдельный тест с явным описанием ожидания.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCitizenship, parseExperienceYears, truncate, sleep } from '../../src/utils/helpers.js';

// ============================================================
// normalizeCitizenship
// ============================================================

describe('normalizeCitizenship', () => {

  describe('→ RU', () => {
    test('"россия" (нижний регистр)', () => {
      assert.equal(normalizeCitizenship('россия'), 'RU');
    });
    test('"Россия" (первая заглавная)', () => {
      assert.equal(normalizeCitizenship('Россия'), 'RU');
    });
    test('"РОССИЯ" (верхний регистр)', () => {
      assert.equal(normalizeCitizenship('РОССИЯ'), 'RU');
    });
    test('"russia" (английский, нижний)', () => {
      assert.equal(normalizeCitizenship('russia'), 'RU');
    });
    test('"Russia" (английский, заглавная)', () => {
      assert.equal(normalizeCitizenship('Russia'), 'RU');
    });
    test('"RU" (код)', () => {
      assert.equal(normalizeCitizenship('RU'), 'RU');
    });
    test('"ru" (код нижний)', () => {
      assert.equal(normalizeCitizenship('ru'), 'RU');
    });
    test('"113" (ID России в HH API)', () => {
      assert.equal(normalizeCitizenship('113'), 'RU');
    });
  });

  describe('→ RU (форматы с локацией, реальный Хабр)', () => {
    test('"Россия, Москва" (поле Проживание с городом)', () => {
      assert.equal(normalizeCitizenship('Россия, Москва'), 'RU');
    });
    test('"Россия, Санкт-Петербург"', () => {
      assert.equal(normalizeCitizenship('Россия, Санкт-Петербург'), 'RU');
    });
  });

  describe('→ OTHER', () => {
    test('"Казахстан"', () => {
      assert.equal(normalizeCitizenship('Казахстан'), 'OTHER');
    });
    test('"Беларусь"', () => {
      assert.equal(normalizeCitizenship('Беларусь'), 'OTHER');
    });
    test('"Ukraine"', () => {
      assert.equal(normalizeCitizenship('Ukraine'), 'OTHER');
    });
    test('"US"', () => {
      assert.equal(normalizeCitizenship('US'), 'OTHER');
    });
    test('"Германия"', () => {
      assert.equal(normalizeCitizenship('Германия'), 'OTHER');
    });
  });

  describe('→ null', () => {
    test('null', () => {
      assert.equal(normalizeCitizenship(null), null);
    });
    test('undefined', () => {
      assert.equal(normalizeCitizenship(undefined), null);
    });
    test('пустая строка ""', () => {
      assert.equal(normalizeCitizenship(''), null);
    });
    test('пробел " "', () => {
      assert.equal(normalizeCitizenship('   '), null);
    });
  });
});

// ============================================================
// parseExperienceYears
// ============================================================

describe('parseExperienceYears', () => {

  describe('число (месяцы — формат HH API)', () => {
    test('60 месяцев → 5 лет', () => {
      assert.equal(parseExperienceYears(60), 5.0);
    });
    test('84 месяца → 7 лет', () => {
      assert.equal(parseExperienceYears(84), 7.0);
    });
    test('42 месяца → 3.5 года', () => {
      assert.equal(parseExperienceYears(42), 3.5);
    });
    test('0 месяцев → 0', () => {
      assert.equal(parseExperienceYears(0), 0);
    });
    test('1 месяц → 0.1 (округление)', () => {
      // 1/12 = 0.0833... → 0.1
      assert.equal(parseExperienceYears(1), 0.1);
    });
    test('59 месяцев → 4.9 (граничный, < 5)', () => {
      assert.equal(parseExperienceYears(59), 4.9);
    });
  });

  describe('строка (формат Хабра)', () => {
    test('"7 лет"', () => {
      assert.equal(parseExperienceYears('7 лет'), 7.0);
    });
    test('"1 год"', () => {
      assert.equal(parseExperienceYears('1 год'), 1.0);
    });
    test('"3 года"', () => {
      assert.equal(parseExperienceYears('3 года'), 3.0);
    });
    test('"3 года 6 месяцев"', () => {
      assert.equal(parseExperienceYears('3 года 6 месяцев'), 3.5);
    });
    test('"7 лет 3 месяца"', () => {
      assert.equal(parseExperienceYears('7 лет 3 месяца'), 7.3);
    });
    test('"11 месяцев" (меньше года)', () => {
      assert.equal(parseExperienceYears('11 месяцев'), 0.9);
    });
    test('"6 месяцев"', () => {
      assert.equal(parseExperienceYears('6 месяцев'), 0.5);
    });
    test('"менее года" → 0.5', () => {
      assert.equal(parseExperienceYears('менее года'), 0.5);
    });
    test('"меньше года" → 0.5', () => {
      assert.equal(parseExperienceYears('меньше года'), 0.5);
    });
    test('"5 лет" ровно (граница ≥5)', () => {
      assert.equal(parseExperienceYears('5 лет'), 5.0);
    });
    test('"9 лет и 9 месяцев" (реальный формат Хабра со словом "и")', () => {
      // 9*12 + 9 = 117 месяцев → 9.8 лет
      assert.equal(parseExperienceYears('9 лет и 9 месяцев'), 9.8);
    });
    test('"Стаж: 9 лет и 9 месяцев" (с префиксом)', () => {
      assert.equal(parseExperienceYears('Стаж: 9 лет и 9 месяцев'), 9.8);
    });
  });

  describe('→ null', () => {
    test('null', () => {
      assert.equal(parseExperienceYears(null), null);
    });
    test('undefined', () => {
      assert.equal(parseExperienceYears(undefined), null);
    });
    test('пустая строка ""', () => {
      assert.equal(parseExperienceYears(''), null);
    });
    test('"нет опыта" (непарсируемая строка)', () => {
      assert.equal(parseExperienceYears('нет опыта'), null);
    });
    test('"опыт не указан"', () => {
      assert.equal(parseExperienceYears('опыт не указан'), null);
    });
  });
});

// ============================================================
// truncate
// ============================================================

describe('truncate', () => {
  test('строка короче maxLen — возвращает как есть', () => {
    assert.equal(truncate('hello', 10), 'hello');
  });
  test('строка равна maxLen — возвращает как есть', () => {
    assert.equal(truncate('hello', 5), 'hello');
  });
  test('строка длиннее maxLen — обрезает с "..."', () => {
    assert.equal(truncate('hello world', 8), 'hello...');
  });
  test('null/undefined → пустая строка', () => {
    assert.equal(truncate(null), '');
    assert.equal(truncate(undefined), '');
  });
  test('дефолтный maxLen = 200', () => {
    const long = 'x'.repeat(210);
    assert.equal(truncate(long).length, 200);
    assert.ok(truncate(long).endsWith('...'));
  });
});

// ============================================================
// sleep
// ============================================================

describe('sleep', () => {
  test('возвращает Promise который резолвится', async () => {
    const result = sleep(1);
    assert.ok(result instanceof Promise);
    await result;
  });
  test('задержка не менее ~5мс (с погрешностью таймера ОС)', async () => {
    const start = Date.now();
    await sleep(20);
    // Допускаем 15мс погрешности таймера ОС (минимальный sleep на Windows ~15мс)
    assert.ok(Date.now() - start >= 5, `elapsed: ${Date.now() - start}ms`);
  });
});
