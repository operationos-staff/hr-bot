# tasks/todo.md — Текущие задачи

> Этот файл обновляется агентом в начале каждой рабочей сессии.

## ✅ Готово: Рейтинг кандидатов «сверху вниз» (2026-04-27)

- [x] Миграция БД: таблица `ui_state` + колонки `ai_needs_clarification`, `ai_clarification`
      → `db/migrations/20260427_200000_add_ranking_support.sql`
- [x] AI-промпт расширен: `needs_clarification` + `clarification` для сильных, но недосказанных кандидатов
      verdict «Уточнить и пригласить»
- [x] `database.js`: `getRanking({ since })`, `getUiState`, `setUiState`
      Сортировка: ai_score DESC NULLS LAST → experience_years DESC → received_at DESC
      Период: `RANKING_SINCE` env (default 2026-04-20)
- [x] `sheets.js`: `refreshRankingSheet()` — отдельная вкладка «Рейтинг» с авто-сортировкой
- [x] `telegram.js`: `upsertPinnedRanking()` — закреплённое сообщение, обновляется через editMessageText
- [x] `poller.js`: после каждого цикла, в котором что-то поменялось, обновляет рейтинг
- [x] `scripts/rebuild-ranking.js` + npm-скрипт `ranking:rebuild`

## Что сделать пользователю вручную

- [ ] Применить миграцию `20260427_200000_add_ranking_support.sql` в Supabase Dashboard → SQL Editor
- [ ] Дать боту в Telegram-канале права закреплять сообщения (administrator → can_pin_messages)
- [ ] (опционально) добавить env-переменные в `.env`:
  - `RANKING_SINCE=2026-04-20T00:00:00Z`
  - `RANKING_LIMIT=50`
  - `RANKING_TELEGRAM_TOP=15`
  - `GOOGLE_SHEET_NAME_RANKING=Рейтинг`
- [ ] Запустить `npm run ranking:rebuild` для первичного заполнения
