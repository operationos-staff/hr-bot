/**
 * /api/vacancies — CRUD для вакансий (D5 + E4).
 *
 * GET    /api/vacancies                — список (?onlyActive=0|1)
 * POST   /api/vacancies                — создать или обновить (по UNIQUE source+external_id)
 * PATCH  /api/vacancies/:id            — частичное обновление (например toggle is_active)
 *
 * Auth: telegramAuth (только пользователи из WEBAPP_ALLOWED_USER_IDS).
 */

import { Router } from 'express';
import { supabase, listVacancies, upsertVacancy } from '../../services/database.js';
import { logger } from '../../utils/logger.js';

export const vacanciesRoutes = Router();

const VALID_SOURCES = new Set(['habr', 'hh']);
const PATCH_FIELDS = new Set(['title', 'description', 'ai_prompt', 'telegram_label', 'is_active']);

vacanciesRoutes.get('/', async (req, res, next) => {
  try {
    const onlyActive = req.query.onlyActive !== '0';
    const items = await listVacancies({ onlyActive });
    res.json({ count: items.length, items });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/vacancies
 * Body: { source, external_id, title, description?, ai_prompt?, telegram_label?, is_active? }
 */
vacanciesRoutes.post('/', async (req, res, next) => {
  try {
    const { source, external_id, title } = req.body || {};

    if (!VALID_SOURCES.has(source)) {
      return res.status(400).json({ error: 'invalid_source', detail: "source must be 'habr' or 'hh'" });
    }
    if (!external_id || !String(external_id).trim()) {
      return res.status(400).json({ error: 'missing_external_id' });
    }
    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'missing_title' });
    }

    await upsertVacancy({
      source,
      external_id: String(external_id).trim(),
      title: String(title).trim(),
      description: req.body.description ?? null,
      ai_prompt: req.body.ai_prompt ?? null,
      telegram_label: req.body.telegram_label ?? null,
      is_active: req.body.is_active !== false,
    });

    // Возвращаем обновлённую запись
    const { data } = await supabase
      .from('vacancies')
      .select('*')
      .eq('source', source)
      .eq('external_id', String(external_id).trim())
      .maybeSingle();

    logger.info(`API vacancies POST: ${source}/${external_id} ${title}`);
    res.json({ ok: true, vacancy: data });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/vacancies/:id
 * Body: одно или несколько полей из PATCH_FIELDS
 */
vacanciesRoutes.patch('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ error: 'missing_id' });

    const patch = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (PATCH_FIELDS.has(k)) patch[k] = v;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: 'no_valid_fields', detail: `accepted: ${[...PATCH_FIELDS].join(', ')}` });
    }

    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('vacancies')
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) {
      logger.error(`API vacancies PATCH error: ${error.message}`);
      return res.status(500).json({ error: 'db_error', detail: error.message });
    }
    if (!data) return res.status(404).json({ error: 'not_found' });

    logger.info(`API vacancies PATCH: ${id} fields=${Object.keys(patch).join(',')}`);
    res.json({ ok: true, vacancy: data });
  } catch (err) {
    next(err);
  }
});
