import { Router } from 'express';
import { supabase } from '../../services/database.js';
import { logger } from '../../utils/logger.js';

export const applicationsRoutes = Router();

const SELECT_FIELDS = `
  source, external_id, candidate_name, candidate_url, application_url,
  position, vacancy_title, location,
  citizenship, citizenship_raw, experience_years,
  qualified, filter_reason, cover_letter,
  ai_score, ai_verdict, ai_summary, ai_needs_clarification, ai_clarification, ai_analyzed_at,
  raw_data, received_at, created_at
`;

const LIST_SELECT_FIELDS = `
  source, external_id, candidate_name, candidate_url, application_url,
  position, vacancy_title, location,
  citizenship, citizenship_raw, experience_years,
  qualified, filter_reason,
  ai_score, ai_verdict, ai_needs_clarification,
  received_at, created_at
`;

/**
 * GET /api/applications
 *   ?status=qualified|maybe|rejected|all   (default: all)
 *   ?source=habr|hh|all                    (default: all)
 *   ?search=<строка>                       (поиск по имени/должности)
 *   ?since=ISO  ?until=ISO
 *   ?minScore=N   ?needsClarification=1
 *   ?limit=50    ?offset=0
 */
applicationsRoutes.get('/', async (req, res, next) => {
  try {
    const {
      status = 'all',
      source = 'all',
      search,
      since,
      until,
      minScore,
      needsClarification,
    } = req.query;

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const offset = parseInt(req.query.offset, 10) || 0;

    let q = supabase
      .from('applications')
      .select(LIST_SELECT_FIELDS, { count: 'exact' });

    // Статус
    if (status === 'qualified') q = q.eq('qualified', true);
    else if (status === 'rejected') q = q.eq('qualified', false);
    else if (status === 'maybe') q = q.is('qualified', null);
    // 'all' — без фильтра

    // Источник
    if (source === 'habr' || source === 'hh') q = q.eq('source', source);

    // Поиск (ilike по имени и должности — Supabase: or)
    if (search && String(search).trim()) {
      const s = String(search).trim().replace(/[%,]/g, '');
      q = q.or(`candidate_name.ilike.%${s}%,position.ilike.%${s}%,vacancy_title.ilike.%${s}%`);
    }

    if (since)  q = q.gte('received_at', since);
    if (until)  q = q.lte('received_at', until);
    if (minScore) q = q.gte('ai_score', parseInt(minScore, 10));
    if (needsClarification === '1') q = q.eq('ai_needs_clarification', true);

    q = q.order('received_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (error) throw error;

    res.json({
      total: count ?? data.length,
      limit,
      offset,
      items: data,
    });
  } catch (err) { next(err); }
});

/**
 * GET /api/applications/:source/:externalId
 * Детальная карточка кандидата.
 */
applicationsRoutes.get('/:source/:externalId', async (req, res, next) => {
  try {
    const { source, externalId } = req.params;
    const { data, error } = await supabase
      .from('applications')
      .select(SELECT_FIELDS)
      .eq('source', source)
      .eq('external_id', String(externalId))
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'not_found' });
    res.json(data);
  } catch (err) { next(err); }
});
