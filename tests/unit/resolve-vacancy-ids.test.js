/**
 * TDD: src/utils/resolve-vacancy-ids.js (E2)
 *
 * Helper для habr.js/hh.js: если в .env заданы HABR_VACANCY_IDS/HH_VACANCY_IDS —
 * использовать их (приоритет, для dev/override). Иначе тянуть из БД через
 * getActiveVacancyExternalIds. Это даёт UI-управление вакансиями без правки .env.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVacancyIds } from '../../src/utils/resolve-vacancy-ids.js';

describe('resolveVacancyIds', () => {

  test('env-список не пустой → возвращает env, БД не дергается', async () => {
    let dbCalled = false;
    const result = await resolveVacancyIds(['100', '200'], async () => {
      dbCalled = true;
      return ['from-db'];
    });
    assert.deepEqual(result, ['100', '200']);
    assert.equal(dbCalled, false);
  });

  test('env пустой массив → fallback на БД', async () => {
    const result = await resolveVacancyIds([], async () => ['db-1', 'db-2']);
    assert.deepEqual(result, ['db-1', 'db-2']);
  });

  test('env undefined → fallback на БД', async () => {
    const result = await resolveVacancyIds(undefined, async () => ['db-x']);
    assert.deepEqual(result, ['db-x']);
  });

  test('env пустой и БД пустой → []', async () => {
    const result = await resolveVacancyIds([], async () => []);
    assert.deepEqual(result, []);
  });

  test('БД-функция упала → возвращает []', async () => {
    const result = await resolveVacancyIds([], async () => {
      throw new Error('DB down');
    });
    assert.deepEqual(result, []);
  });

  test('env не пуст, БД-функция не вызывается даже при наличии', async () => {
    const calls = [];
    await resolveVacancyIds(['env-only'], async () => {
      calls.push('called');
      return [];
    });
    assert.deepEqual(calls, []);
  });
});
