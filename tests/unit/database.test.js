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
  getVacancyBySourceExternal,
  listVacancies,
  setApplicationVacancy,
  upsertVacancy,
  getActiveVacancyExternalIds,
  markApplicationProcessed,
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

  // D5: фильтр по vacancy_id для Mini App страниц
  test('vacancyId задан → добавляется .eq("vacancy_id", id)', async () => {
    mock._setResult({ data: [], error: null });
    await getRanking({ vacancyId: 'vac-uuid-1' });
    const eqCall = mock._calls.find(c => c[0] === 'eq' && c[1] === 'vacancy_id');
    assert.ok(eqCall, 'must filter by vacancy_id');
    assert.equal(eqCall[2], 'vac-uuid-1');
  });

  test('vacancyId не задан → .eq("vacancy_id", ...) НЕ вызывается', async () => {
    mock._setResult({ data: [], error: null });
    await getRanking({});
    const eqCall = mock._calls.find(c => c[0] === 'eq' && c[1] === 'vacancy_id');
    assert.equal(eqCall, undefined);
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

// ============================================================
// Vacancies (D1) — модель «вакансия как first-class объект»
// ============================================================

describe('getVacancyBySourceExternal', () => {
  let mock;
  beforeEach(() => {
    mock = makeMockClient();
    _setSupabaseForTests(mock);
  });

  test('возвращает row при найденной вакансии', async () => {
    const fixture = {
      id: 'vac-uuid', source: 'habr', external_id: '1000164921',
      title: 'PHP Developer', ai_prompt: 'Оценивай по PHP',
    };
    mock._setResult({ data: fixture, error: null });
    const v = await getVacancyBySourceExternal('habr', '1000164921');
    assert.deepEqual(v, fixture);
  });

  test('возвращает null если не найдена', async () => {
    mock._setResult({ data: null, error: null });
    const v = await getVacancyBySourceExternal('hh', 'absent');
    assert.equal(v, null);
  });

  test('возвращает null при ошибке (не throw)', async () => {
    mock._setResult({ data: null, error: { message: 'oops' } });
    const v = await getVacancyBySourceExternal('habr', 'x');
    assert.equal(v, null);
  });

  test('строит запрос: from(vacancies)→select→eq(source)→eq(external_id)→maybeSingle', async () => {
    mock._setResult({ data: null, error: null });
    await getVacancyBySourceExternal('hh', '999');
    assert.deepEqual(mock._calls[0], ['from', 'vacancies']);
    const eqCalls = mock._calls.filter(c => c[0] === 'eq');
    assert.deepEqual(eqCalls[0], ['eq', 'source', 'hh']);
    assert.deepEqual(eqCalls[1], ['eq', 'external_id', '999']);
    assert.ok(mock._calls.find(c => c[0] === 'maybeSingle'), 'maybeSingle must be called');
  });
});

describe('listVacancies', () => {
  let mock;
  beforeEach(() => {
    mock = makeMockClient();
    _setSupabaseForTests(mock);
  });

  test('по умолчанию возвращает только is_active=true', async () => {
    mock._setResult({ data: [], error: null });
    await listVacancies();
    const eqCall = mock._calls.find(c => c[0] === 'eq' && c[1] === 'is_active');
    assert.ok(eqCall, 'must filter by is_active');
    assert.equal(eqCall[2], true);
  });

  test('onlyActive=false → не фильтрует по is_active', async () => {
    mock._setResult({ data: [], error: null });
    await listVacancies({ onlyActive: false });
    const eqCall = mock._calls.find(c => c[0] === 'eq' && c[1] === 'is_active');
    assert.equal(eqCall, undefined, 'must NOT filter is_active when onlyActive=false');
  });

  test('сортирует по created_at DESC', async () => {
    mock._setResult({ data: [], error: null });
    await listVacancies();
    const orderCall = mock._calls.find(c => c[0] === 'order');
    assert.ok(orderCall);
    assert.equal(orderCall[1], 'created_at');
    assert.equal(orderCall[2].ascending, false);
  });

  test('возвращает [] при ошибке', async () => {
    mock._setResult({ data: null, error: { message: 'oops' } });
    const result = await listVacancies();
    assert.deepEqual(result, []);
  });

  test('возвращает массив вакансий при успехе', async () => {
    const fixture = [
      { id: '1', source: 'habr', title: 'PHP', is_active: true },
      { id: '2', source: 'hh', title: 'amoCRM', is_active: true },
    ];
    mock._setResult({ data: fixture, error: null });
    const result = await listVacancies();
    assert.deepEqual(result, fixture);
  });
});

describe('setApplicationVacancy', () => {
  let mock;
  beforeEach(() => {
    mock = makeMockClient();
    _setSupabaseForTests(mock);
  });

  test('успешный update не throws', async () => {
    mock._setResult({ error: null });
    await assert.doesNotReject(() =>
      setApplicationVacancy('app-uuid', 'vac-uuid')
    );
  });

  test('обновляет applications.vacancy_id по id', async () => {
    mock._setResult({ error: null });
    await setApplicationVacancy('app-uuid-1', 'vac-uuid-7');
    assert.deepEqual(mock._calls[0], ['from', 'applications']);
    const updateCall = mock._calls.find(c => c[0] === 'update');
    assert.deepEqual(updateCall[1], { vacancy_id: 'vac-uuid-7' });
    const eqCall = mock._calls.find(c => c[0] === 'eq');
    assert.deepEqual(eqCall, ['eq', 'id', 'app-uuid-1']);
  });

  test('null vacancyId допустим (отвязка)', async () => {
    mock._setResult({ error: null });
    await setApplicationVacancy('app-uuid', null);
    const updateCall = mock._calls.find(c => c[0] === 'update');
    assert.equal(updateCall[1].vacancy_id, null);
  });

  test('error → throw', async () => {
    mock._setResult({ error: { message: 'fk violation' } });
    await assert.rejects(() => setApplicationVacancy('a', 'v'));
  });
});

describe('getActiveVacancyExternalIds (E1)', () => {
  let mock;
  beforeEach(() => {
    mock = makeMockClient();
    _setSupabaseForTests(mock);
  });

  test('возвращает массив строк external_id для активных вакансий source', async () => {
    mock._setResult({
      data: [
        { external_id: '1000164921' },
        { external_id: '1000999111' },
      ],
      error: null,
    });
    const ids = await getActiveVacancyExternalIds('habr');
    assert.deepEqual(ids, ['1000164921', '1000999111']);
  });

  test('фильтр по source и is_active=true', async () => {
    mock._setResult({ data: [], error: null });
    await getActiveVacancyExternalIds('hh');
    assert.deepEqual(mock._calls[0], ['from', 'vacancies']);
    const eqCalls = mock._calls.filter(c => c[0] === 'eq');
    const sourceCall = eqCalls.find(c => c[1] === 'source');
    const activeCall = eqCalls.find(c => c[1] === 'is_active');
    assert.deepEqual(sourceCall, ['eq', 'source', 'hh']);
    assert.deepEqual(activeCall, ['eq', 'is_active', true]);
  });

  test('возвращает [] при пустом результате', async () => {
    mock._setResult({ data: [], error: null });
    const ids = await getActiveVacancyExternalIds('habr');
    assert.deepEqual(ids, []);
  });

  test('возвращает [] при ошибке (не throws)', async () => {
    mock._setResult({ data: null, error: { message: 'oops' } });
    const ids = await getActiveVacancyExternalIds('habr');
    assert.deepEqual(ids, []);
  });
});

describe('markApplicationProcessed (F2)', () => {
  let mock;
  beforeEach(() => {
    mock = makeMockClient();
    _setSupabaseForTests(mock);
  });

  test('processed=true → ставит processed_at = now() ISO + processed_by', async () => {
    mock._setResult({ error: null });
    await markApplicationProcessed('habr', '4516024', { by: 'vladislav', value: true });
    const updateCall = mock._calls.find(c => c[0] === 'update');
    assert.ok(updateCall);
    const payload = updateCall[1];
    assert.equal(typeof payload.processed_at, 'string');
    assert.match(payload.processed_at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(payload.processed_by, 'vladislav');
  });

  test('processed=false → processed_at = null + processed_by = null (снять метку)', async () => {
    mock._setResult({ error: null });
    await markApplicationProcessed('habr', '4516024', { by: 'vladislav', value: false });
    const updateCall = mock._calls.find(c => c[0] === 'update');
    assert.equal(updateCall[1].processed_at, null);
    assert.equal(updateCall[1].processed_by, null);
  });

  test('фильтр по source + external_id', async () => {
    mock._setResult({ error: null });
    await markApplicationProcessed('hh', '5263801800', { by: 'x', value: true });
    const eqCalls = mock._calls.filter(c => c[0] === 'eq');
    const sourceEq = eqCalls.find(c => c[1] === 'source');
    const idEq = eqCalls.find(c => c[1] === 'external_id');
    assert.deepEqual(sourceEq, ['eq', 'source', 'hh']);
    assert.deepEqual(idEq, ['eq', 'external_id', '5263801800']);
  });

  test('error в Supabase → throw', async () => {
    mock._setResult({ error: { message: 'permission denied' } });
    await assert.rejects(
      () => markApplicationProcessed('habr', '1', { by: 'x', value: true })
    );
  });
});

describe('upsertVacancy', () => {
  let mock;
  beforeEach(() => {
    mock = makeMockClient();
    _setSupabaseForTests(mock);
  });

  test('upsert с onConflict source+external_id', async () => {
    mock._setResult({ error: null });
    const vac = {
      source: 'habr',
      external_id: '1000164921',
      title: 'PHP Developer',
      description: 'Описание...',
      ai_prompt: 'Оценивай PHP',
      telegram_label: 'PHP',
      is_active: true,
    };
    await upsertVacancy(vac);
    const upsertCall = mock._calls.find(c => c[0] === 'upsert');
    assert.ok(upsertCall, 'upsert must be called');
    // Payload в первом аргументе
    assert.equal(upsertCall[1].source, 'habr');
    assert.equal(upsertCall[1].external_id, '1000164921');
    assert.equal(upsertCall[1].title, 'PHP Developer');
    // onConflict — во втором аргументе
    assert.equal(upsertCall[2]?.onConflict, 'source,external_id');
  });

  test('error → throw', async () => {
    mock._setResult({ error: { message: 'unique violation' } });
    await assert.rejects(() => upsertVacancy({ source: 'habr', external_id: '1', title: 't' }));
  });
});
