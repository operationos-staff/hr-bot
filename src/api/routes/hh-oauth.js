/**
 * HH OAuth callback (C0).
 *
 * Endpoint: GET https://api.assisthelp.ru/hh/callback?code=...
 *
 * Flow:
 *   1. Пользователь открывает в браузере:
 *      https://hh.ru/oauth/authorize?response_type=code&client_id=...&redirect_uri=https://api.assisthelp.ru/hh/callback
 *   2. HH спрашивает разрешение, пользователь соглашается
 *   3. HH редиректит на /hh/callback?code=ABC...
 *   4. Этот роут обменивает code на access/refresh токены через
 *      POST https://api.hh.ru/token и сохраняет их в Supabase (oauth_tokens).
 *   5. На следующий запрос HH-API в poller'е токен берётся из БД (через
 *      refreshAccessToken) — без рестарта процесса.
 *
 * Безопасность: роут публичный (без telegramAuth), но обмен code на token
 * требует client_secret, который только у нас в .env. Перехваченный code
 * без secret обменять нельзя.
 *
 * Документация HH: https://github.com/hhru/api/blob/master/docs/authorization_for_employers.md
 */

import { Router } from 'express';
import axios from 'axios';
import { config } from '../../config.js';
import { saveHHTokens } from '../../services/database.js';
import { logger } from '../../utils/logger.js';

const HH_TOKEN_URL = 'https://api.hh.ru/token';

/**
 * Pure-функция: обмен authorization code на пару (access_token, refresh_token).
 * Тестируется через DI (httpPost).
 *
 * @param {Object} params
 * @param {string} params.code         — authorization code из ?code=
 * @param {string} params.clientId
 * @param {string} params.clientSecret
 * @param {string} params.redirectUri  — должен совпадать с тем, что в админке HH
 * @param {Object} [deps]
 * @param {Function} [deps.httpPost]   — по умолчанию axios.post
 * @returns {Promise<{access_token: string, refresh_token: string, expires_in: number}>}
 */
export async function exchangeHHCodeForToken(
  { code, clientId, clientSecret, redirectUri },
  deps = { httpPost: axios.post },
) {
  if (!code) throw new Error('exchangeHHCodeForToken: empty code');
  if (!clientId) throw new Error('exchangeHHCodeForToken: empty clientId (client_id)');
  if (!clientSecret) throw new Error('exchangeHHCodeForToken: empty clientSecret');
  if (!redirectUri) throw new Error('exchangeHHCodeForToken: empty redirectUri');

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
  });

  const res = await deps.httpPost(HH_TOKEN_URL, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });

  const data = res?.data;
  if (!data?.access_token) {
    throw new Error('HH /token: access_token missing in response');
  }
  if (!data?.refresh_token) {
    throw new Error('HH /token: refresh_token missing in response');
  }
  return data;
}

// ============================================================
// Express-роут
// ============================================================
export const hhOauthRoutes = Router();

hhOauthRoutes.get('/callback', async (req, res) => {
  const code = req.query.code ? String(req.query.code) : '';
  const errorParam = req.query.error ? String(req.query.error) : '';

  // HH вернул ошибку (пользователь отказал в доступе и т.п.)
  if (errorParam) {
    logger.warn(`HH OAuth callback error param: ${errorParam}`);
    return res.status(400).type('html').send(
      `<!doctype html><meta charset="utf-8"><h1>❌ HH вернул ошибку</h1><p><code>${errorParam}</code></p>`
    );
  }

  if (!code) {
    return res.status(400).type('html').send(
      `<!doctype html><meta charset="utf-8"><h1>❌ Нет параметра <code>code</code></h1><p>Перейди по правильной OAuth-ссылке HH.</p>`
    );
  }

  try {
    const tokens = await exchangeHHCodeForToken({
      code,
      clientId: config.hh.clientId,
      clientSecret: config.hh.clientSecret,
      redirectUri: config.hh.redirectUri,
    });

    const expiresAt = new Date(Date.now() + (tokens.expires_in || 0) * 1000).toISOString();
    await saveHHTokens({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt,
    });

    logger.info(`HH OAuth callback: tokens saved, expires at ${expiresAt}`);

    res.type('html').send(
      `<!doctype html><meta charset="utf-8">
       <h1 style="font-family:system-ui">✅ HH подключён</h1>
       <p style="font-family:system-ui">Токены сохранены в БД. Можно закрыть вкладку — бот подхватит их автоматически.</p>
       <p style="font-family:system-ui;color:#888">expires_at: ${expiresAt}</p>`
    );
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    logger.error(`HH OAuth callback failed: ${detail}`);
    res.status(500).type('html').send(
      `<!doctype html><meta charset="utf-8"><h1>❌ Ошибка обмена</h1><pre>${escapeHtml(detail)}</pre>`
    );
  }
});

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
