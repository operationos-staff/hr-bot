-- Миграция: добавить AI-оценку к откликам
-- Применить через: Supabase Dashboard → SQL Editor
-- Rollback: ALTER TABLE applications DROP COLUMN IF EXISTS ai_score; DROP COLUMN IF EXISTS ai_verdict; DROP COLUMN IF EXISTS ai_summary;

ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_score    integer;        -- оценка 1-10 от DeepSeek
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_verdict  text;           -- 'Приглашать на интервью' / 'Рассмотреть' / 'Отказать'
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_summary  text;           -- итоговый вывод тим-лида
ALTER TABLE applications ADD COLUMN IF NOT EXISTS ai_analyzed_at timestamptz; -- когда провели анализ

-- Индекс для быстрой сортировки по рейтингу
CREATE INDEX IF NOT EXISTS idx_applications_ai_score ON applications (ai_score DESC NULLS LAST);
