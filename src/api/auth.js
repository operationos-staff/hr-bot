/**
 * Telegram Mini App auth.
 *
 * Каждый запрос от WebApp несёт заголовок X-Telegram-Init-Data
 * (значение window.Telegram.WebApp.initData — querystring).
 *
 * Мы валидируем его HMAC-SHA256 от bot token + проверяем, что
 * user.id в whitelist (config.api.allowedUserIds).
 *
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

import crypto from 'node:crypto';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const MAX_AGE_SECONDS = 24 * 60 * 60; // 24h — initData считается «свежим»

/**
 * Парсит и валидирует initData от Telegram WebApp.
 * @returns {{ ok: true, user: object } | { ok: false, reason: string }}
 */
export function verifyInitData(initDataRaw, botToken) {
  if (!initDataRaw || typeof initDataRaw !== 'string') {
    return { ok: false, reason: 'no init data' };
  }

  const params = new URLSearchParams(initDataRaw);
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'no hash' };

  // Все остальные параметры (без hash), отсортированные алфавитно — соединить через \n
  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');

  // secret_key = HMAC_SHA256(bot_token, "WebAppData")
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calcHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  if (calcHash !== hash) {
    return { ok: false, reason: 'bad hash' };
  }

  // Свежесть
  const authDate = parseInt(params.get('auth_date') || '0', 10);
  if (!authDate) return { ok: false, reason: 'no auth_date' };
  const now = Math.floor(Date.now() / 1000);
  if (now - authDate > MAX_AGE_SECONDS) {
    return { ok: false, reason: 'init data expired' };
  }

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    return { ok: false, reason: 'bad user json' };
  }
  if (!user || !user.id) return { ok: false, reason: 'no user' };

  return { ok: true, user, authDate };
}

/**
 * Express middleware: проверяет initData и whitelist.
 * Кладёт req.tgUser.
 */
export function telegramAuth(req, res, next) {
  const initData = req.header('X-Telegram-Init-Data') || req.query.initData;

  // В dev можно отключить через API_AUTH_DISABLED=1 (только локально!)
  if (config.api.authDisabled) {
    req.tgUser = { id: 0, username: 'dev', first_name: 'Dev' };
    return next();
  }

  const result = verifyInitData(initData, config.telegram.token);
  if (!result.ok) {
    logger.warn(`API auth failed: ${result.reason} (ip=${req.ip})`);
    return res.status(401).json({ error: 'unauthorized', reason: result.reason });
  }

  const allowed = config.api.allowedUserIds;
  if (allowed.length > 0 && !allowed.includes(result.user.id)) {
    logger.warn(`API access denied for user ${result.user.id} (@${result.user.username || '?'})`);
    return res.status(403).json({ error: 'forbidden' });
  }

  req.tgUser = result.user;
  next();
}
