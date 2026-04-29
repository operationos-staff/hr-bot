/**
 * API client. Каждый запрос подмешивает X-Telegram-Init-Data —
 * на бэке проверяется HMAC и whitelist user_id.
 */

import { initData } from './telegram';
import type {
  RankingResponse,
  ApplicationsResponse,
  CandidateDetail,
  StatsSummary,
  AppSettings,
  VacanciesResponse,
} from './types';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function http<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (initData) headers.set('X-Telegram-Init-Data', initData);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');

  const res = await fetch(`${BASE_URL}${path}`, { ...init, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }

  if (!res.ok) {
    const err = new Error(data?.error || `${res.status} ${res.statusText}`) as Error & { status?: number; detail?: string };
    err.status = res.status;
    err.detail = data?.detail || data?.reason || text;
    throw err;
  }
  return data as T;
}

export const api = {
  health: () => http<{ ok: boolean; time: string }>('/api/health'),

  ranking: (params: { since?: string; limit?: number; vacancyId?: string | null } = {}) => {
    const qs = new URLSearchParams();
    if (params.since) qs.set('since', params.since);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.vacancyId) qs.set('vacancy_id', params.vacancyId);
    return http<RankingResponse>(`/api/ranking?${qs}`);
  },

  rebuildRanking: () =>
    http<{ sheets: any; telegram: any }>('/api/ranking/rebuild', { method: 'POST', body: '{}' }),

  applications: (params: {
    status?: string; source?: string; search?: string;
    since?: string; until?: string;
    minScore?: number; needsClarification?: boolean;
    vacancyId?: string | null;
    limit?: number; offset?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        const apiKey = k === 'vacancyId' ? 'vacancy_id' : k;
        qs.set(apiKey, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
      }
    });
    return http<ApplicationsResponse>(`/api/applications?${qs}`);
  },

  // D5: вакансии для навигации Mini App
  vacancies: (onlyActive: boolean = true) => {
    const qs = new URLSearchParams();
    qs.set('onlyActive', onlyActive ? '1' : '0');
    return http<VacanciesResponse>(`/api/vacancies?${qs}`);
  },

  candidate: (source: string, externalId: string) =>
    http<CandidateDetail>(`/api/applications/${encodeURIComponent(source)}/${encodeURIComponent(externalId)}`),

  stats: (since?: string) => {
    const qs = new URLSearchParams();
    if (since) qs.set('since', since);
    return http<StatsSummary>(`/api/stats/summary?${qs}`);
  },

  settings: {
    get: () => http<AppSettings>('/api/settings'),
    update: (patch: Partial<AppSettings>) =>
      http<AppSettings>('/api/settings', { method: 'PATCH', body: JSON.stringify(patch) }),
  },
};
