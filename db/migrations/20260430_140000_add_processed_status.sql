-- ==========================================
-- Миграция: статус «обработан» у отклика (F1)
-- Дата: 2026-04-30
--
-- Что делает:
--   1. Добавляет applications.processed_at (timestamptz nullable)
--      — null = не обработан, дата = когда HR кликнул «Обработан».
--   2. Добавляет applications.processed_by (text)
--      — Telegram username того, кто отметил (для аудита).
--   3. Индекс по processed_at для быстрых фильтров «только новые».
--
-- Применить: Supabase Dashboard → SQL Editor.
--
-- Rollback (только при крайней необходимости — данные о processed потеряются):
--   ALTER TABLE applications DROP COLUMN IF EXISTS processed_at;
--   ALTER TABLE applications DROP COLUMN IF EXISTS processed_by;
-- ==========================================

ALTER TABLE applications ADD COLUMN IF NOT EXISTS processed_at timestamptz;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS processed_by text;

CREATE INDEX IF NOT EXISTS idx_applications_processed_at ON applications (processed_at);

-- Проверка
SELECT
  column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'applications' AND column_name IN ('processed_at', 'processed_by');
