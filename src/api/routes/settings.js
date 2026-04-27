import { Router } from 'express';
import { getUiState, setUiState } from '../../services/database.js';
import { config } from '../../config.js';

export const settingsRoutes = Router();

const SETTINGS_KEY = 'webapp_settings_v1';

const DEFAULT_SETTINGS = {
  rankingSince: config.ranking.since,
  rankingLimit: config.ranking.limit,
  rankingTelegramTop: config.ranking.telegramTop,
  defaultMinScore: 0,
  defaultStatus: 'all',
  defaultSource: 'all',
  showOnlyAiAnalyzed: false,
};

/**
 * GET /api/settings
 * Возвращает merge env-defaults + user overrides из ui_state.
 */
settingsRoutes.get('/', async (_req, res, next) => {
  try {
    const raw = await getUiState(SETTINGS_KEY);
    let overrides = {};
    if (raw) {
      try { overrides = JSON.parse(raw); } catch { /* ignore */ }
    }
    res.json({ ...DEFAULT_SETTINGS, ...overrides });
  } catch (err) { next(err); }
});

/**
 * PATCH /api/settings
 * Сохраняет переданные ключи поверх текущих overrides.
 */
settingsRoutes.patch('/', async (req, res, next) => {
  try {
    const allowedKeys = Object.keys(DEFAULT_SETTINGS);
    const patch = {};
    for (const k of allowedKeys) {
      if (k in req.body) patch[k] = req.body[k];
    }

    const raw = await getUiState(SETTINGS_KEY);
    let current = {};
    if (raw) { try { current = JSON.parse(raw); } catch { /* ignore */ } }

    const next = { ...current, ...patch };
    await setUiState(SETTINGS_KEY, JSON.stringify(next));

    res.json({ ...DEFAULT_SETTINGS, ...next });
  } catch (err) { next(err); }
});
