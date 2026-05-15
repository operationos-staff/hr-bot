-- ==========================================
-- Bot_HH_Habr — отметка о переносе в clon2 воронку
-- Применить через Supabase Dashboard → SQL Editor (project: hqyfsfopjsebuhjofrsi)
-- ==========================================

-- ID кандидата в clon2.candidates после нажатия «В воронку Острова».
-- NULL = ещё не в воронке. Заполняется services/funnel.js после успешного INSERT.
alter table public.applications
  add column if not exists funnel_candidate_id text,
  add column if not exists funnel_pushed_at    timestamptz,
  add column if not exists funnel_pushed_by    text;

create index if not exists idx_applications_funnel_pushed
  on public.applications (funnel_pushed_at) where funnel_pushed_at is not null;

comment on column public.applications.funnel_candidate_id is
  'UUID кандидата в clon2.candidates после переноса в воронку найма (NULL = ещё не в воронке)';
