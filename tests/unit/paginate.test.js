/**
 * TDD: src/utils/paginate.js — универсальный pagination-helper (D9)
 *
 * Принимает fetchPage(page) → {items, pages?} и итерирует страницы,
 * пока не получит неполную страницу или не упрётся в maxPages.
 * Используется в hh.js для получения всех откликов на вакансию,
 * а не только первой страницы 50.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { paginate } from '../../src/utils/paginate.js';

describe('paginate', () => {

  test('одна неполная страница → 1 запрос, возвращает items', async () => {
    let calls = 0;
    const fetchPage = async (page) => {
      calls++;
      return { items: [{ id: 1 }, { id: 2 }, { id: 3 }], pages: 1 };
    };
    const result = await paginate(fetchPage, { perPage: 50 });
    assert.equal(calls, 1);
    assert.deepEqual(result, [{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  test('несколько полных страниц + последняя неполная — итерирует пока items.length < perPage', async () => {
    const pages = {
      0: { items: Array.from({ length: 50 }, (_, i) => ({ id: i })), pages: 3 },
      1: { items: Array.from({ length: 50 }, (_, i) => ({ id: 50 + i })), pages: 3 },
      2: { items: Array.from({ length: 13 }, (_, i) => ({ id: 100 + i })), pages: 3 },
    };
    const calls = [];
    const fetchPage = async (page) => {
      calls.push(page);
      return pages[page];
    };
    const result = await paginate(fetchPage, { perPage: 50 });
    assert.deepEqual(calls, [0, 1, 2]);
    assert.equal(result.length, 113);
    assert.equal(result[0].id, 0);
    assert.equal(result[112].id, 112);
  });

  test('maxPages ограничивает итерацию', async () => {
    const calls = [];
    const fetchPage = async (page) => {
      calls.push(page);
      return { items: Array.from({ length: 50 }, (_, i) => ({ id: page * 50 + i })), pages: 100 };
    };
    const result = await paginate(fetchPage, { perPage: 50, maxPages: 3 });
    assert.deepEqual(calls, [0, 1, 2]);
    assert.equal(result.length, 150);
  });

  test('pages в ответе → останавливается достигнув последней страницы', async () => {
    const calls = [];
    const fetchPage = async (page) => {
      calls.push(page);
      // 2 страницы по 50, обе полные (но pages=2 → стоп после второй)
      return { items: Array.from({ length: 50 }, (_, i) => ({ id: page * 50 + i })), pages: 2 };
    };
    const result = await paginate(fetchPage, { perPage: 50 });
    assert.deepEqual(calls, [0, 1]);
    assert.equal(result.length, 100);
  });

  test('пустой ответ на первой странице → []', async () => {
    let calls = 0;
    const fetchPage = async () => {
      calls++;
      return { items: [], pages: 0 };
    };
    const result = await paginate(fetchPage, { perPage: 50 });
    assert.equal(calls, 1);
    assert.deepEqual(result, []);
  });

  test('items=undefined в ответе → пропускает', async () => {
    const fetchPage = async () => ({ /* нет items */ });
    const result = await paginate(fetchPage, { perPage: 50 });
    assert.deepEqual(result, []);
  });

  test('по умолчанию maxPages=10 чтобы не словить бесконечный цикл', async () => {
    const calls = [];
    const fetchPage = async (page) => {
      calls.push(page);
      return { items: Array.from({ length: 50 }, (_, i) => ({ id: page * 50 + i })) };
      // pages не передан → опираемся только на perPage и maxPages
    };
    const result = await paginate(fetchPage, { perPage: 50 });
    assert.equal(calls.length, 10);
    assert.equal(result.length, 500);
  });

  test('ошибка fetchPage пробрасывается наружу', async () => {
    const fetchPage = async (page) => {
      if (page === 1) throw new Error('HH 500');
      return { items: Array.from({ length: 50 }, (_, i) => ({ id: i })), pages: 5 };
    };
    await assert.rejects(
      () => paginate(fetchPage, { perPage: 50 }),
      /HH 500/
    );
  });
});
