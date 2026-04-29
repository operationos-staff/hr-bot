# tasks/todo.md — Текущие задачи

> Этот файл обновляется агентом в начале каждой рабочей сессии.

## 🎯 Активная цель (2026-04-29)

> Бот на VPS уже крутится. Нужно: (1) укрепить мониторинг Хабра тестами на критичные места, чтобы Mini App точно получал новые отклики, (2) подключить HH в режиме employer по тому же принципу.
> Работаем строго в TDD: тест → код → зелёное → следующий цикл.

### Блок A — надёжность Habr-мониторинга (тесты на «горячие» места) ✅ выполнено 2026-04-29
- [x] A1. Тесты на `src/services/database.js` (мок supabase-client):
  - `isApplicationExists(source, externalId)` — true/false, ошибка чтения → null/throw
  - `saveApplication(app)` — нормальный insert; UNIQUE 23505 → тихий пропуск, не throw
  - `getRanking({ since })` — использует `.or('qualified.is.null,qualified.eq.true')` (урок из lessons.md), сортировка ai_score DESC NULLS LAST → experience_years DESC → received_at DESC
  - `saveAiScore` — не теряет needs_clarification/clarification
- [x] A2. Тесты на `src/workers/poller.js` (моки источников/сервисов):
  - один сбой источника не валит цикл (Habr 500 → HH всё равно опрашивается)
  - `processApplication` склеивает filterResult в app, external_id = String, поля null а не undefined
  - при `totalProcessed === 0` рейтинг не пересчитывается (экономия API)
  - при `totalProcessed > 0` и сбое refreshRankingSheet — upsertPinnedRanking всё равно вызывается

### Блок B — HH source (employer mode, по принципу Хабра) ✅ выполнено 2026-04-29
- [x] B1. Чистый нормализатор `src/sources/hh-normalizer.js` (по аналогии с habr-normalizer.js): `normalizeHHNegotiation(neg, resumeData)` без зависимостей от axios/config
- [x] B2. Юнит-тесты на нормализатор по фикстурам JSON ответов API HH (negotiations + resumes), все обязательные поля + null вместо undefined + employer-режим
- [x] B3. Рефакторинг `src/sources/hh.js`: импортирует нормализатор, добавлены `isHHEnabled()` и DI; поддержка `HH_VACANCY_IDS` (список вакансий); все ветки покрыты юнит-тестами
- [x] B4. Smoke-тест: `node --test tests/unit/*.test.js` — 183/183 зелёное

### Блок C — после получения HH OAuth credentials от пользователя
- [ ] C1. Прокинуть HH_CLIENT_ID, HH_CLIENT_SECRET, HH_REFRESH_TOKEN, HH_EMPLOYER_ID, HH_VACANCY_IDS (для вакансии amoCRM) в `.env`
- [ ] C2. Локально запустить `node src/sources/hh.js` или smoke-poll → убедиться, что приходят реальные negotiations
- [ ] C3. Задеплоить .env на VPS (vm7377), `pm2 restart bot-hh-habr`, проверить `pm2 logs bot-hh-habr`
- [ ] C4. (опционально) Завести отдельный AI-промпт для вакансии amoCRM — иначе тех. спец будет оцениваться по требованиям PHP-вакансии



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

- [x] Применить миграцию `20260427_200000_add_ranking_support.sql` в Supabase Dashboard → SQL Editor (2026-04-29)
- [ ] Дать боту в Telegram-канале права закреплять сообщения (administrator → can_pin_messages)
- [x] env-переменные добавлены в `.env` (2026-04-29):
  - `RANKING_SINCE=2026-04-20T00:00:00Z`
  - `RANKING_LIMIT=50`
  - `RANKING_TELEGRAM_TOP=15`
  - `GOOGLE_SHEET_NAME_RANKING=Рейтинг`
- [ ] Запустить `npm run ranking:rebuild` для первичного заполнения
