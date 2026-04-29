import { Router } from 'express';
import { getRanking } from '../../services/database.js';
import { refreshRankingSheet } from '../../services/sheets.js';
import { upsertPinnedRanking } from '../../services/telegram.js';
import { config } from '../../config.js';

export const rankingRoutes = Router();

/**
 * GET /api/ranking?since=ISO&limit=N
 * Список кандидатов сверху вниз (✅/🟡 за период).
 */
rankingRoutes.get('/', async (req, res, next) => {
  try {
    const since = req.query.since || config.ranking.since;
    const limit = Math.min(parseInt(req.query.limit, 10) || config.ranking.limit, 200);
    // D5: фильтр по вакансии для Mini App-страниц
    const vacancyId = req.query.vacancy_id || null;
    const data = await getRanking({ since, limit, vacancyId });
    res.json({ since, limit, vacancyId, count: data.length, items: data });
  } catch (err) { next(err); }
});

/**
 * POST /api/ranking/rebuild
 * Пересчитать рейтинг (Sheets + Telegram pinned)
 */
rankingRoutes.post('/rebuild', async (_req, res, next) => {
  try {
    const [sheetRows, pinnedId] = await Promise.allSettled([
      refreshRankingSheet(),
      upsertPinnedRanking(),
    ]);
    res.json({
      sheets: sheetRows.status === 'fulfilled' ? { ok: true, rows: sheetRows.value } : { ok: false, error: String(sheetRows.reason?.message || sheetRows.reason) },
      telegram: pinnedId.status === 'fulfilled' ? { ok: true, messageId: pinnedId.value } : { ok: false, error: String(pinnedId.reason?.message || pinnedId.reason) },
    });
  } catch (err) { next(err); }
});
