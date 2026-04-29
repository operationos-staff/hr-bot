/**
 * GET /api/vacancies
 *   ?onlyActive=0|1   (default: 1 — только активные)
 *
 * Список вакансий для Mini App-навигации (D5).
 * Каждая запись имеет id, source, external_id, title, telegram_label,
 * description, ai_prompt, is_active.
 */

import { Router } from 'express';
import { listVacancies } from '../../services/database.js';

export const vacanciesRoutes = Router();

vacanciesRoutes.get('/', async (req, res, next) => {
  try {
    const onlyActive = req.query.onlyActive !== '0';
    const items = await listVacancies({ onlyActive });
    res.json({ count: items.length, items });
  } catch (err) {
    next(err);
  }
});
