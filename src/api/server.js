/**
 * HTTP API для Telegram Mini App.
 *
 * Запуск:
 *   node src/api/server.js
 *   pm2 start deploy/api.ecosystem.config.cjs
 *
 * Архитектура:
 *   [Mini App, Cloudflare Pages] --(HTTPS, X-Telegram-Init-Data)--> [nginx] --> [Express :3001] --> [Supabase]
 */

import express from 'express';
import cors from 'cors';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { telegramAuth } from './auth.js';
import { rankingRoutes } from './routes/ranking.js';
import { applicationsRoutes } from './routes/applications.js';
import { statsRoutes } from './routes/stats.js';
import { settingsRoutes } from './routes/settings.js';
import { vacanciesRoutes } from './routes/vacancies.js';

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

// CORS — разрешаем только указанные origin (Cloudflare Pages, etc.)
app.use(cors({
  origin: (origin, cb) => {
    // Запросы без origin (curl, server-to-server) пропускаем для health
    if (!origin) return cb(null, true);
    if (config.api.allowedOrigins.length === 0) return cb(null, true); // если whitelist пуст — пускаем всех
    if (config.api.allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: false,
  allowedHeaders: ['Content-Type', 'X-Telegram-Init-Data'],
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
}));

// Простейший request log
app.use((req, _res, next) => {
  logger.debug(`API ${req.method} ${req.url}`);
  next();
});

// --- Public ---
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// --- Authenticated ---
app.use('/api', telegramAuth);
app.use('/api/ranking', rankingRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/vacancies', vacanciesRoutes);

// 404
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// Errors
app.use((err, _req, res, _next) => {
  logger.error(`API error: ${err.message}`);
  if (err.message?.startsWith('CORS blocked')) {
    return res.status(403).json({ error: 'cors_blocked', detail: err.message });
  }
  res.status(500).json({ error: 'internal_error', detail: err.message });
});

const port = config.api.port;
const host = config.api.host;

app.listen(port, host, () => {
  logger.info(`API listening on http://${host}:${port}`);
  if (config.api.authDisabled) {
    logger.warn('⚠️  API_AUTH_DISABLED=1 — auth bypassed (dev only!)');
  }
  if (config.api.allowedUserIds.length === 0) {
    logger.warn('⚠️  WEBAPP_ALLOWED_USER_IDS is empty — anyone with valid initData can access');
  }
});
