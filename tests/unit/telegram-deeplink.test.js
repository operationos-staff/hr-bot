/**
 * TDD: src/services/telegram.js — buildMiniAppLink (D6)
 *
 * Direct Link Mini App: https://t.me/<bot_username>/<short_name>?startapp=<param>
 * Открывается ВНУТРИ Telegram даже из канала (где web_app-кнопки запрещены).
 * fallback на legacy WEBAPP_URL если bot_username/short_name не настроены.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildMiniAppLink } from '../../src/services/telegram.js';

const APP = { source: 'habr', external_id: '12345' };

describe('buildMiniAppLink — Direct Link Mini App (D6)', () => {

  test('возвращает t.me-ссылку с startapp при настроенных bot+short', () => {
    const url = buildMiniAppLink(APP, {
      botUsername: 'trat_hr_bot',
      miniAppShortName: 'hr_app',
      webappUrl: 'https://hr-bots.vercel.app/',
    });
    assert.ok(url.startsWith('https://t.me/trat_hr_bot/hr_app'),
      `expected t.me link, got: ${url}`);
    assert.ok(url.includes('startapp='));
  });

  test('startapp кодирует source и external_id', () => {
    const url = buildMiniAppLink(APP, {
      botUsername: 'trat_hr_bot',
      miniAppShortName: 'hr_app',
      webappUrl: 'https://x',
    });
    const u = new URL(url);
    const startapp = u.searchParams.get('startapp');
    assert.ok(startapp);
    assert.ok(startapp.includes('habr'));
    assert.ok(startapp.includes('12345'));
  });

  test('startapp использует "_" как разделитель (Telegram запрещает специальные символы)', () => {
    const url = buildMiniAppLink(APP, {
      botUsername: 'trat_hr_bot',
      miniAppShortName: 'hr_app',
      webappUrl: 'https://x',
    });
    const u = new URL(url);
    const startapp = u.searchParams.get('startapp');
    // Только [a-zA-Z0-9_] разрешено в startapp
    assert.match(startapp, /^[a-zA-Z0-9_]+$/);
  });

  test('пустой botUsername → fallback на WEBAPP_URL (legacy)', () => {
    const url = buildMiniAppLink(APP, {
      botUsername: '',
      miniAppShortName: 'hr_app',
      webappUrl: 'https://hr-bots.vercel.app/',
    });
    assert.ok(url.startsWith('https://hr-bots.vercel.app'),
      `expected vercel fallback, got: ${url}`);
  });

  test('пустой miniAppShortName → fallback на WEBAPP_URL', () => {
    const url = buildMiniAppLink(APP, {
      botUsername: 'trat_hr_bot',
      miniAppShortName: '',
      webappUrl: 'https://hr-bots.vercel.app/',
    });
    assert.ok(url.startsWith('https://hr-bots.vercel.app'));
  });

  test('всё пусто → возвращает null (нет ссылки в кнопке)', () => {
    const url = buildMiniAppLink(APP, {
      botUsername: '',
      miniAppShortName: '',
      webappUrl: '',
    });
    assert.equal(url, null);
  });

  test('app=null (для общей кнопки на pinned-сообщении) — без startapp', () => {
    const url = buildMiniAppLink(null, {
      botUsername: 'trat_hr_bot',
      miniAppShortName: 'hr_app',
      webappUrl: 'https://hr-bots.vercel.app/',
    });
    assert.ok(url.startsWith('https://t.me/trat_hr_bot/hr_app'));
    // Без app — startapp не нужен
    assert.ok(!url.includes('startapp='),
      `expected no startapp for null app, got: ${url}`);
  });
});
