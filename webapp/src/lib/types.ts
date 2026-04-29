// Совпадает по полям с тем, что отдаёт API на /api/applications

export type Source = 'habr' | 'hh';
export type Qualified = true | false | null;
export type Status = 'all' | 'qualified' | 'maybe' | 'rejected';

export interface CandidateBase {
  source: Source;
  external_id: string;
  candidate_name: string | null;
  candidate_url: string | null;
  application_url: string | null;
  position: string | null;
  vacancy_title: string | null;
  vacancy_id: string | null;
  location: string | null;
  citizenship: 'RU' | 'OTHER' | null;
  citizenship_raw: string | null;
  experience_years: number | null;
  qualified: Qualified;
  filter_reason: string | null;
  ai_score: number | null;
  ai_verdict: string | null;
  ai_needs_clarification: boolean | null;
  received_at: string | null;
  created_at: string;
}

// D5: модель вакансии для Mini App-навигации
export interface Vacancy {
  id: string;
  source: Source;
  external_id: string;
  title: string;
  description: string | null;
  ai_prompt: string | null;
  telegram_label: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface VacanciesResponse {
  count: number;
  items: Vacancy[];
}

export interface CandidateDetail extends CandidateBase {
  cover_letter: string | null;
  ai_summary: string | null;
  ai_clarification: string | null;
  ai_analyzed_at: string | null;
  raw_data: any;
}

export interface RankingResponse {
  since: string;
  limit: number;
  count: number;
  items: CandidateBase[];
}

export interface ApplicationsResponse {
  total: number;
  limit: number;
  offset: number;
  items: CandidateBase[];
}

export interface StatsSummary {
  since: string;
  kpi: {
    total: number;
    qualified: number;
    maybe: number;
    rejected: number;
    aiAnalyzed: number;
    needsClarification: number;
    avgScore: number;
  };
  bySource: Record<string, { total: number; qualified: number; maybe: number; rejected: number }>;
  timeline: { date: string; total: number; qualified: number; maybe: number; rejected: number }[];
  scoreDistribution: { range: string; count: number }[];
}

export interface AppSettings {
  rankingSince: string;
  rankingLimit: number;
  rankingTelegramTop: number;
  defaultMinScore: number;
  defaultStatus: Status;
  defaultSource: Source | 'all';
  showOnlyAiAnalyzed: boolean;
}
