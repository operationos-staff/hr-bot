/**
 * TDD: src/api/routes/hh-oauth.js — exchangeHHCodeForToken (C0)
 *
 * Pure-функция, обменивающая authorization code на access/refresh-токены
 * через POST https://api.hh.ru/token. Тестируем без реального axios.
 *
 * Документация: https://github.com/hhru/api/blob/master/docs/authorization_for_employers.md
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { exchangeHHCodeForToken } from '../../src/api/routes/hh-oauth.js';

// Mock-helper для HTTP POST — записывает вызовы и возвращает заданный результат
function makeHttpPost(result, opts = {}) {
  const calls = [];
  const fn = async (url, body, config) => {
    calls.push({ url, body, config });
    if (opts.throwOnce && calls.length === 1) throw opts.throwOnce;
    if (typeof result === 'function') return result(url, body, config);
    return result;
  };
  fn.calls = calls;
  return fn;
}

// ============================================================
// exchangeHHCodeForToken — happy path
// ============================================================
describe('exchangeHHCodeForToken — успешный обмен', () => {

  test('возвращает access_token, refresh_token и expires_in', async () => {
    const httpPost = makeHttpPost({
      data: { access_token: 'A1', refresh_token: 'R1', expires_in: 1209600, token_type: 'bearer' },
    });
    const tokens = await exchangeHHCodeForToken({
      code: 'CODE123',
      clientId: 'CID',
      clientSecret: 'SECRET',
      redirectUri: 'https://api.assisthelp.ru/hh/callback',
    }, { httpPost });

    assert.equal(tokens.access_token, 'A1');
    assert.equal(tokens.refresh_token, 'R1');
    assert.equal(tokens.expires_in, 1209600);
  });

  test('POST идёт на api.hh.ru/token', async () => {
    const httpPost = makeHttpPost({
      data: { access_token: 'A', refresh_token: 'R', expires_in: 1 },
    });
    await exchangeHHCodeForToken({
      code: 'C', clientId: 'X', clientSecret: 'Y', redirectUri: 'https://x',
    }, { httpPost });
    assert.equal(httpPost.calls[0].url, 'https://api.hh.ru/token');
  });

  test('тело запроса = x-www-form-urlencoded со всеми параметрами', async () => {
    const httpPost = makeHttpPost({
      data: { access_token: 'A', refresh_token: 'R', expires_in: 1 },
    });
    await exchangeHHCodeForToken({
      code: 'CODE', clientId: 'CID', clientSecret: 'SEC', redirectUri: 'https://r',
    }, { httpPost });

    const body = httpPost.calls[0].body;
    const params = new URLSearchParams(String(body));
    assert.equal(params.get('grant_type'), 'authorization_code');
    assert.equal(params.get('client_id'), 'CID');
    assert.equal(params.get('client_secret'), 'SEC');
    assert.equal(params.get('code'), 'CODE');
    assert.equal(params.get('redirect_uri'), 'https://r');
  });

  test('Content-Type: application/x-www-form-urlencoded', async () => {
    const httpPost = makeHttpPost({
      data: { access_token: 'A', refresh_token: 'R', expires_in: 1 },
    });
    await exchangeHHCodeForToken({
      code: 'C', clientId: 'X', clientSecret: 'Y', redirectUri: 'https://x',
    }, { httpPost });
    const headers = httpPost.calls[0].config?.headers || {};
    assert.equal(headers['Content-Type'], 'application/x-www-form-urlencoded');
  });
});

// ============================================================
// exchangeHHCodeForToken — error paths
// ============================================================
describe('exchangeHHCodeForToken — ошибки', () => {

  test('ответ без access_token → throw', async () => {
    const httpPost = makeHttpPost({
      data: { refresh_token: 'R', expires_in: 1 }, // нет access_token
    });
    await assert.rejects(
      () => exchangeHHCodeForToken({
        code: 'C', clientId: 'X', clientSecret: 'Y', redirectUri: 'https://x',
      }, { httpPost }),
      /access_token|missing/i
    );
  });

  test('ответ без refresh_token → throw', async () => {
    const httpPost = makeHttpPost({
      data: { access_token: 'A', expires_in: 1 }, // нет refresh_token
    });
    await assert.rejects(
      () => exchangeHHCodeForToken({
        code: 'C', clientId: 'X', clientSecret: 'Y', redirectUri: 'https://x',
      }, { httpPost }),
      /refresh_token|missing/i
    );
  });

  test('сетевая ошибка проксируется наружу', async () => {
    const httpPost = makeHttpPost(null, { throwOnce: new Error('ETIMEDOUT') });
    await assert.rejects(
      () => exchangeHHCodeForToken({
        code: 'C', clientId: 'X', clientSecret: 'Y', redirectUri: 'https://x',
      }, { httpPost }),
      /ETIMEDOUT/
    );
  });

  test('пустой code → throw до похода в сеть', async () => {
    const httpPost = makeHttpPost({ data: {} });
    await assert.rejects(
      () => exchangeHHCodeForToken({
        code: '', clientId: 'X', clientSecret: 'Y', redirectUri: 'https://x',
      }, { httpPost }),
      /code/i
    );
    assert.equal(httpPost.calls.length, 0, 'не должны были даже идти в сеть');
  });

  test('пустой clientId → throw до похода в сеть', async () => {
    const httpPost = makeHttpPost({ data: {} });
    await assert.rejects(
      () => exchangeHHCodeForToken({
        code: 'C', clientId: '', clientSecret: 'Y', redirectUri: 'https://x',
      }, { httpPost }),
      /client_id|clientId/i
    );
  });
});
