-- Миграция: поддержка рейтинга кандидатов
-- 1. Таблица ui_state — key/value хранилище для id pinned-сообщения Telegram
-- 2. Колонки ai_needs_clarification и ai_clarification — для случая
--    "сильный кандидат, но не хватает данных, нужно уточнить"
--
-- Применить через: Supabase Dashboard → SQL Editor
-- Rollback:
--   DROP TABLE IF EXISTS ui_state;
--   ALTER TABLE applications DROP COLUMN IF EXISTS ai_needs_clarification;
--   ALTER TABLE applications DROP COLUMN IF EXISTS ai_clarification;

-- ==========================================
-- 1) ui_state — хранилище id закреплённого сообщения и т.п.
-- ==========================================
CREATE TABLE IF NOT EXISTS ui_state (
  key         text PRIMARY KEY,
  value       text,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE ui_state ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 2) Колонки для пометки "уточнить"
-- ==========================================
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS ai_needs_clarification boolean DEFAULT false;

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS ai_clarification text;  -- список вопросов, которые надо уточнить

-- Индекс для быстрого выбора рейтинга по дате
CREATE INDEX IF NOT EXISTS idx_applications_received_at
  ON applications (received_at DESC NULLS LAST);
