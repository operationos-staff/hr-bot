/**
 * TDD: src/services/database.js
 *
 * Стратегия: инжектим mock supabase-клиент через _setSupabaseForTests.
 * Mock — chainable thenable proxy: каждая цепочка возвращает себя,
 * await на финальном узле резолвится в заранее заданный { data, error }.
 *
 * Покрываем:
 * - isApplicationExists: true / false / error → false (не throw)
 * - saveApplication: insert OK / 23505 silent skip / другая ошибка → throw
 * - getRanking: использует .or('qualified.is.null,qualified.eq.true') (lessons.md 2026-04-27),
 *               сортировка ai_score → experience_years → received_at (все DESC nullsFirst:false для первых двух)
 * - saveAiScore: needs_clarification + clarification сохраняются корректно
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  isApplicationExists,
  saveApplication,
  saveAiScore,
  getRanking,
  _setSupabaseForTests,
} from '../../src/services/database.js';

// ============================================================
// Утилита: chainable thenable proxy для имитации supabase-js
// ============================================================
function makeMockClient() {
  const calls = [];
  // Текущий результат, который будет резолвиться при await
  let currentResult = { data: null, error: null };

  function makeChain(method, ...args) {
    calls.push([method, ...args]);
    return chainable;
  }

  const chainable = new Proxy({}, {
    get(_, prop) {
      // Делаем chainable thenable
      if (prop === 'then') {
        return (resolve, reject) =>
          Promise.resolve(currentResult).then(resolve, reject);
      }
      // Любой method-call возвращает себя и пишет в calls
      return (...args) => makeChain(prop, ...args);
    },
  });

  return {
    _calls: calls,
    _setResult(r) { currentResult = r; },
    from(table) {
      calls.push(['from', table]);
      return chainable;
    },
  };
}

// ============================================================
// isApplicationExists
// ============================================================
describe('isApplicationExists', () => {
  let mock;
  beforeEach(() => {
    mock = makeMockClient();
    _setSupabaseForTests(mock);
  });

  test('возвращает true когда запись найдена', async () => {
    mock._setResult({ data: { id: 'uuid-1' }, error: null });
    const result = await isApplicationExists('habr', '12345');
    assert.equal(result, true);
  });

  test('возвращает false когда data = null', async () => {
    mock._setResult({ data: null, error: null });
    const result = await isApplicationExists('habr', 'no-such');
    assert.equal(result, false);
  });

  test('возвращает false при ошибке (не throw)', async () => {
    mock._setResult({ data: null, error: { message: 'DB down' } });
    const result = await isApplicationExists('habr', 'xxx');
    assert.equal(result, false);
  });

  test('строит правильный запрос: from→select→eq(source)→eq(external_id)→maybeSingle', async () => {
    mock._setResult({ data: null, error: null });
    await isApplicationExists('hh', '999');
    const methods = mock._calls.map(c => c[0]);
    assert.deepEqual(methods, ['from', 'select', 'eq', 'eq', 'maybeSingle']);
    assert.deepEqual(mock._calls[0], ['from', 'applications']);
    assert.deepEqual(mock._calls[2], ['eq', 'source', 'hh']);
    assert.deepEqual(mock._calls[3], ['eq', 'external_id', '999']);
  });
});

// ============================================================
// saveApplication
// ============================================================
describe('saveApplication', () => {
  let mock;
  beforeEach(() => {
    mock = makeMockClient();
    _setSupabaseForTests(mock);
  });

  test('успешный insert не бросает', async () => {
    mock._setResult({ error: null });
    const app = { source: 'habr', external_id: '1', candidate_name: 'X' };
    await assert.doesNotReject(() => saveApplication(app));
  });

  test('UNIQUE violation (code 23505) → silent skip, не throw', async () => {
    mock._setResult({ error: { code: '23505', message: 'duplicate key' } });
    const app = { source: 'habr', external_id: '1' };
    await assert.doesNotReject(() => saveApplication(app));
  });

  test('другая ошибка → throw', async () => {
    mock._setResult({ error: { code: '42P01', message: 'relation does not exist' } });
    const app = { source: 'habr', external_id: '1' };
    await assert.rejects(() => saveApplication(app));
  });

  test('вызывает from(applications).insert(application)', async () => {
    mock._setResult({ error: null });
    const app = { source: 'habr', external_id: '7', qualified: true };
    await saveApplication(app);
    assert.deepEqual(mock._calls[0], ['from', 'applications']);
    assert.deepEqual(mock._calls[1], ['insert', app]);
  });
});

// ============================================================
// getRanking — урок 2026-04-27 lessons.md: .or() вместо .in([null])
// ============================================================
describe('getRanking', () => {
  let mock;
  beforeEach(() => {
    mock = makeMockClient();
    _setSupabaseForTests(mock);
  });

  test('использует .or("qualified.is.null,qualified.eq.true") (НЕ .in([null]))', async () => {
    mock._setResult({ data: [], error: null });
    await getRanking({ since: '2026-04-20T00:00:00Z' });
    const orCall = mock._calls.find(c => c[0] === 'or');
    assert.ok(orCall, 'getRanking must call .or()');
    assert.equal(orCall[1], 'qualified.is.null,qualified.eq.true');
    // null не должен передаваться в .in() — урок lessons.md
    const inCall = mock._calls.find(c => c[0] === 'in');
    assert.equal(inCall, undefined, '.in() с null ломает PostgREST — нельзя использовать');
  });

  test('применяет .gte("received_at", since)', async () => {
    mock._setResult({ data: [], error: null });
    const since = '2026-04-20T00:00:00Z';
    await getRanking({ since });
    const gteCall = mock._calls.find(c => c[0] === 'gte');
    assert.deepEqual(gteCall, ['gte', 'received_at', since]);
  });

  test('сортирует ai_score DESC NULLS LAST → experience_years DESC NULLS LAST → received_at DESC', async () => {
    mock._setResult({ data: [], error: null });
    await getRanking({});
    const orderCalls = mock._calls.filter(c => c[0] === 'order');
    assert.equal(orderCalls.length, 3, 'must have 3 .order() calls');
    assert.equal(orderCalls[0][1], 'ai_score');
    assert.equal(orderCalls[0][2].ascending, false);
    assert.equal(orderCalls[0][2].nullsFirst, false); // NULLS LAST
    assert.equal(orderCalls[1][1], 'experience_years');
    assert.equal(orderCalls[1][2].ascending, false);
    assert.equal(orderCalls[1][2].nullsFirst, false);
    assert.equal(orderCalls[2][1], 'received_at');
    assert.equal(orderCalls[2][2].ascending, false);
  });

  test('применяет .limit(limit) с дефолтом 100', async () => {
    mock._setResult({ data: [], error: null });
    await getRanking({});
    const limitCall = mock._calls.find(c => c[0] === 'limit');
    assert.deepEqual(limitCall, ['limit', 100]);
  });

  test('возвращает [] при ошибке (не throw)', async () => {
    mock._setResult({ data: null, error: { message: 'oops' } });
    const result = await getRanking({});
    assert.deepEqual(result, []);
  });

  test('возвращает data при успехе', async () => {
    const fixture = [{ external_id: '1', ai_score: 9 }, { external_id: '2', ai_score: 7 }];
    mock._setResult({ data: fixture, error: null });
    const result = await getRanking({});
    assert.deepEqual(result, fixture);
  });
});

// ============================================================
// saveAiScore — needs_clarification + clarification
// ============================================================
describe('saveAiScore', () => {
  let mock;
  beforeEach(() => {
    mock = makeMockClient();
    _setSupabaseForTests(mock);
  });

  test('сохраняет needs_clarification=true и clarification-текст', async () => {
    mock._setResult({ error: null });
    await saveAiScore('habr', '777', {
      score: 8,
      verdict: 'Уточнить и пригласить',
      summary: 'Сильный, но без AmoCRM',
      needsClarification: true,
      clarification: 'Спросить про опыт с amoCRM',
    });
    const updateCall = mock._calls.find(c => c[0] === 'update');
    assert.ok(updateCall, 'must call update()');
    const payload = updateCall[1];
    assert.equal(payload.ai_score, 8);
    assert.equal(payload.ai_needs_clarification, true);
    assert.equal(payload.ai_clarification, 'Спросить про опыт с amoCRM');
  });

  test('пустая clarification → сохраняем null (не пустую строку)', async () => {
    mock._setResult({ error: null });
    await saveAiScore('habr', '8', {
      score: 5,
      verdict: 'Отказать',
      summary: 'Слаб',
      needsClarification: false,
      clarification: '',
    });
    const updateCall = mock._calls.find(c => c[0] === 'update');
    assert.equal(updateCall[1].ai_clarification, null);
    assert.equal(updateCall[1].ai_needs_clarification, false);
  });

  test('error в Supabase → throw', async () => {
    mock._setResult({ error: { message: 'permission denied' } });
    await assert.rejects(
      () => saveAiScore('habr', '9', { score: 1, verdict: 'x', summary: 'y' })
    );
  });
});
