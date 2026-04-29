/**
 * TDD: src/workers/poller.js
 *
 * Стратегия: DI — runPollCycle и processApplication принимают опциональный deps-параметр.
 * В тестах подменяем все зависимости (источники, БД, Telegram, Sheets, AI),
 * при этом функции остаются обратно-совместимыми (без аргумента берут реальные импорты).
 *
 * Покрытие:
 * - устойчивость: один источник падает — другой всё равно опрашивается
 * - processApplication: external_id всегда String, filterResult вмержен в app
 * - экономия API: при totalProcessed===0 рейтинг не пересчитывается
 * - при totalProcessed>0 — refreshRankingSheet и upsertPinnedRanking оба вызываются
 * - сбой AI/Sheets/Telegram внутри processApplication не должен останавливать цикл целиком
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { runPollCycle, processApplication } from '../../src/workers/poller.js';

// ============================================================
// Хелпер: счётчик-mock
// ============================================================
function spy(returnValue) {
  const fn = async (...args) => {
    fn.calls.push(args);
    if (typeof returnValue === 'function') return returnValue(...args);
    return returnValue;
  };
  fn.calls = [];
  return fn;
}

function spyThrows(err) {
  const fn = async (...args) => {
    fn.calls.push(args);
    throw err;
  };
  fn.calls = [];
  return fn;
}

// Базовые «no-op»-deps, которые тесты могут переопределять
function makeDeps(overrides = {}) {
  return {
    getNewHabrApplications: spy([]),
    getNewHHApplications: spy([]),
    filterApplication: (raw) => ({
      qualified: true,
      filter_reason: null,
      citizenship: 'RU',
      experience_years: 7,
    }),
    isApplicationExists: spy(false),
    saveApplication: spy(undefined),
    saveAiScore: spy(undefined),
    sendApplicationCard: spy(undefined),
    sendAlert: spy(undefined),
    sendAiAnalysis: spy(undefined),
    upsertPinnedRanking: spy(undefined),
    appendQualifiedCandidate: spy(undefined),
    refreshRankingSheet: spy(undefined),
    fetchCandidateFullText: spy(''),
    analyzeCandidate: spy(null),
    formatAiAnalysis: (a) => '',
    ...overrides,
  };
}

// ============================================================
// processApplication
// ============================================================
describe('processApplication', () => {

  test('external_id всегда String (даже если raw.external_id число)', async () => {
    const deps = makeDeps();
    const raw = { source: 'habr', external_id: 12345, candidate_name: 'X' };
    await processApplication(raw, deps);
    const savedApp = deps.saveApplication.calls[0][0];
    assert.equal(savedApp.external_id, '12345');
    assert.equal(typeof savedApp.external_id, 'string');
  });

  test('склеивает filterResult в сохраняемый объект', async () => {
    const deps = makeDeps({
      filterApplication: () => ({
        qualified: false,
        filter_reason: 'опыт 3 < 5',
        citizenship: 'RU',
        experience_years: 3,
      }),
    });
    await processApplication({ source: 'habr', external_id: '1' }, deps);
    const savedApp = deps.saveApplication.calls[0][0];
    assert.equal(savedApp.qualified, false);
    assert.equal(savedApp.filter_reason, 'опыт 3 < 5');
    assert.equal(savedApp.experience_years, 3);
  });

  test('citizenship_raw сохраняется отдельно от нормализованного citizenship', async () => {
    const deps = makeDeps({
      filterApplication: () => ({
        qualified: false,
        filter_reason: 'не РФ',
        citizenship: 'OTHER',
        experience_years: 6,
      }),
    });
    const raw = { source: 'habr', external_id: '1', citizenship: 'Казахстан' };
    await processApplication(raw, deps);
    const savedApp = deps.saveApplication.calls[0][0];
    assert.equal(savedApp.citizenship_raw, 'Казахстан');
    assert.equal(savedApp.citizenship, 'OTHER'); // из filter
  });

  test('null поля сохраняются как null, не undefined', async () => {
    const deps = makeDeps();
    const raw = { source: 'habr', external_id: '1' }; // ничего не указано
    await processApplication(raw, deps);
    const savedApp = deps.saveApplication.calls[0][0];
    for (const key of ['candidate_name', 'candidate_url', 'application_url', 'vacancy_title', 'position', 'location', 'cover_letter', 'citizenship_raw']) {
      assert.equal(savedApp[key], null, `${key} should be null, got ${savedApp[key]}`);
    }
  });

  test('saveApplication вызывается до sendApplicationCard (порядок важен — дубли)', async () => {
    const order = [];
    const deps = makeDeps({
      saveApplication: async () => { order.push('save'); },
      sendApplicationCard: async () => { order.push('tg'); },
    });
    await processApplication({ source: 'habr', external_id: '1' }, deps);
    assert.deepEqual(order.slice(0, 2), ['save', 'tg']);
  });
});

// ============================================================
// runPollCycle — устойчивость
// ============================================================
describe('runPollCycle — устойчивость', () => {

  test('падение Habr-источника не блокирует HH', async () => {
    const deps = makeDeps({
      getNewHabrApplications: spyThrows(new Error('habr 500')),
      getNewHHApplications: spy([]),
    });
    await assert.doesNotReject(() => runPollCycle(deps));
    assert.equal(deps.getNewHHApplications.calls.length, 1, 'HH must still be polled');
  });

  test('падение HH-источника не валит цикл — Habr-отклики уже обработаны', async () => {
    const habrApp = { source: 'habr', external_id: '99' };
    const deps = makeDeps({
      getNewHabrApplications: spy([habrApp]),
      getNewHHApplications: spyThrows(new Error('hh oauth')),
    });
    await assert.doesNotReject(() => runPollCycle(deps));
    assert.equal(deps.saveApplication.calls.length, 1, 'Habr app должен быть сохранён до падения HH');
  });

  test('cookie expired в Habr → отправляется sendAlert', async () => {
    const err = new Error('Habr cookie expired');
    const deps = makeDeps({
      getNewHabrApplications: spyThrows(err),
    });
    await runPollCycle(deps);
    assert.equal(deps.sendAlert.calls.length, 1, 'sendAlert must be called on cookie expiry');
    assert.match(deps.sendAlert.calls[0][0], /[Cc]ookie/);
  });
});

// ============================================================
// runPollCycle — экономия API при 0 изменений
// ============================================================
describe('runPollCycle — рейтинг обновляется только при изменениях', () => {

  test('при 0 новых откликов — refreshRankingSheet НЕ вызывается', async () => {
    const deps = makeDeps(); // оба источника возвращают []
    const processed = await runPollCycle(deps);
    assert.equal(processed, 0);
    assert.equal(deps.refreshRankingSheet.calls.length, 0);
    assert.equal(deps.upsertPinnedRanking.calls.length, 0);
  });

  test('при 1+ новом отклике — refreshRankingSheet И upsertPinnedRanking вызываются', async () => {
    const habrApp = { source: 'habr', external_id: '7' };
    const deps = makeDeps({
      getNewHabrApplications: spy([habrApp]),
    });
    const processed = await runPollCycle(deps);
    assert.equal(processed, 1);
    assert.equal(deps.refreshRankingSheet.calls.length, 1);
    assert.equal(deps.upsertPinnedRanking.calls.length, 1);
  });

  test('сбой refreshRankingSheet НЕ блокирует upsertPinnedRanking (независимые)', async () => {
    const habrApp = { source: 'habr', external_id: '7' };
    const deps = makeDeps({
      getNewHabrApplications: spy([habrApp]),
      refreshRankingSheet: spyThrows(new Error('Sheets API down')),
    });
    await runPollCycle(deps);
    assert.equal(deps.upsertPinnedRanking.calls.length, 1, 'pinned ranking must still update');
  });
});

// ============================================================
// runPollCycle — мульти-источник, оба активны
// ============================================================
describe('runPollCycle — оба источника', () => {

  test('обрабатывает отклики из Habr и HH в одном цикле', async () => {
    const deps = makeDeps({
      getNewHabrApplications: spy([{ source: 'habr', external_id: '1' }]),
      getNewHHApplications: spy([{ source: 'hh', external_id: '2' }]),
    });
    const processed = await runPollCycle(deps);
    assert.equal(processed, 2);
    assert.equal(deps.saveApplication.calls.length, 2);
    const sources = deps.saveApplication.calls.map(c => c[0].source).sort();
    assert.deepEqual(sources, ['habr', 'hh']);
  });

  test('ошибка обработки одного отклика не валит остальные в этом источнике', async () => {
    let callCount = 0;
    const deps = makeDeps({
      getNewHabrApplications: spy([
        { source: 'habr', external_id: '1' },
        { source: 'habr', external_id: '2' },
        { source: 'habr', external_id: '3' },
      ]),
      saveApplication: async (app) => {
        callCount++;
        if (app.external_id === '2') throw new Error('DB hiccup on app #2');
      },
    });
    const processed = await runPollCycle(deps);
    assert.equal(callCount, 3, 'все 3 попытки saveApplication должны быть выполнены');
    // processed считает только успешно обработанные
    assert.equal(processed, 2);
  });
});
