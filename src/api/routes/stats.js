import { Router } from 'express';
import { supabase } from '../../services/database.js';
import { config } from '../../config.js';

export const statsRoutes = Router();

/**
 * GET /api/stats/summary?since=ISO
 * Собирает KPI и распределения для дэшборда.
 */
statsRoutes.get('/summary', async (req, res, next) => {
  try {
    const since = req.query.since || config.ranking.since;

    const { data, error } = await supabase
      .from('applications')
      .select('source, qualified, ai_score, ai_needs_clarification, received_at, created_at')
      .gte('received_at', since)
      .limit(5000);

    if (error) throw error;

    const items = data || [];

    // KPI
    const total = items.length;
    const qualified = items.filter(i => i.qualified === true).length;
    const maybe = items.filter(i => i.qualified === null).length;
    const rejected = items.filter(i => i.qualified === false).length;
    const aiAnalyzed = items.filter(i => i.ai_score !== null && i.ai_score !== undefined).length;
    const needsClarification = items.filter(i => i.ai_needs_clarification === true).length;

    const scored = items.filter(i => typeof i.ai_score === 'number').map(i => i.ai_score);
    const avgScore = scored.length ? scored.reduce((s, v) => s + v, 0) / scored.length : 0;

    // По источникам
    const bySource = {};
    for (const i of items) {
      const k = i.source || 'unknown';
      if (!bySource[k]) bySource[k] = { total: 0, qualified: 0, maybe: 0, rejected: 0 };
      bySource[k].total += 1;
      if (i.qualified === true) bySource[k].qualified += 1;
      else if (i.qualified === null) bySource[k].maybe += 1;
      else bySource[k].rejected += 1;
    }

    // Динамика по дням (received_at)
    const byDate = {};
    for (const i of items) {
      const d = (i.received_at || i.created_at || '').slice(0, 10);
      if (!d) continue;
      if (!byDate[d]) byDate[d] = { date: d, total: 0, qualified: 0, maybe: 0, rejected: 0 };
      byDate[d].total += 1;
      if (i.qualified === true) byDate[d].qualified += 1;
      else if (i.qualified === null) byDate[d].maybe += 1;
      else byDate[d].rejected += 1;
    }
    const timeline = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

    // Распределение AI score (бакеты: 1-3, 4-6, 7-8, 9-10)
    const buckets = {
      '1-3': 0, '4-6': 0, '7-8': 0, '9-10': 0,
    };
    for (const v of scored) {
      if (v <= 3) buckets['1-3'] += 1;
      else if (v <= 6) buckets['4-6'] += 1;
      else if (v <= 8) buckets['7-8'] += 1;
      else buckets['9-10'] += 1;
    }
    const scoreDistribution = Object.entries(buckets).map(([range, count]) => ({ range, count }));

    res.json({
      since,
      kpi: {
        total,
        qualified,
        maybe,
        rejected,
        aiAnalyzed,
        needsClarification,
        avgScore: Math.round(avgScore * 10) / 10,
      },
      bySource,
      timeline,
      scoreDistribution,
    });
  } catch (err) { next(err); }
});
