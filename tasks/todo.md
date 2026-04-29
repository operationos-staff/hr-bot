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

### Блок C — после одобрения заявки HH (#21003 «рассматривается»)
- [ ] C0. **Новый роут `src/api/routes/hh-oauth.js` (api.assisthelp.ru/hh/callback)** —
       принимает `?code=`, обменивает на access/refresh через POST /token,
       сохраняет в `oauth_tokens`. Юнит-тесты на обмен (мок axios).
- [ ] C1. Прокинуть HH_CLIENT_ID, HH_CLIENT_SECRET, HH_EMPLOYER_ID, HH_VACANCY_IDS в `.env`
- [ ] C2. Открыть `https://hh.ru/oauth/authorize?response_type=code&client_id=...&redirect_uri=https://api.assisthelp.ru/hh/callback`
       → callback сохранит токены в БД, poller подхватит автоматически
- [ ] C3. Smoke-test: `pm2 logs bot-hh-habr` → видны новые отклики из HH

### Блок D — per-vacancy логика (старт 2026-04-29)
**Развилки решены:**
- Telegram → один канал (как сейчас), карточки с префиксом «[Вакансия: ...]»
- Mini App → разводим по страницам (отдельная страница на каждую вакансию)
- HH OAuth callback → новый роут на api.assisthelp.ru/hh/callback

- [x] D1. **Миграция БД + БД-функции (TDD)** — выполнено 2026-04-29 ✅
  - SQL-миграция `db/migrations/{ts}_add_vacancies.sql`:
    - таблица `vacancies` (id UUID, source, external_id, title, description, ai_prompt, telegram_label, is_active, timestamps; UNIQUE(source, external_id))
    - колонка `applications.vacancy_id` UUID nullable, FK → vacancies(id) ON DELETE NO ACTION
    - сидирование текущей PHP-вакансии (HABR_VACANCY_IDS=1000164921) с описанием из `vacancy.txt`
    - бэкфил: применить vacancy_id ко всем существующим habr-applications
  - Юнит-тесты `database.js`: `getVacancyBySourceExternal`, `listVacancies({onlyActive})`, `setApplicationVacancy`
- [x] D2. **ai-scorer.js per-vacancy промпт (TDD)** — 2026-04-29 ✅
  - `buildPrompt(vacancy, candidate)` берёт `vacancy.ai_prompt` или дефолт
  - `analyzeCandidate(app, resumeText, vacancy)` — vacancy идёт сверху от poller
  - Тесты на выбор промпта по разным вакансиям
- [x] D3. **poller проставляет vacancy_id (TDD)** — 2026-04-29 ✅
  - habr-источник: vacancy_id из `vacancyId` (уже есть в normalizeHabrResponse)
  - hh-источник: vacancy_id из `neg.vacancy.id`
  - `processApplication` резолвит vacancy через `getVacancyBySourceExternal`, пишет в БД
  - Тесты: `app.vacancy_id` корректно проставлен
- [ ] D4. **Telegram-карточка с префиксом вакансии (TDD)**
  - `buildMessage(app, vacancy)` начинается с `[Вакансия: {vacancy.title}]`
  - Один канал — разделение через текст карточки
  - Тесты на разные вакансии в одном канале
- [ ] D5. **API + Mini App — страницы по вакансиям**
  - `GET /api/vacancies` — список активных
  - `GET /api/applications?vacancy_id=...` — фильтр
  - `GET /api/ranking?vacancy_id=...` — фильтр в существующем endpoint
  - Mini App: навигация (Tabs или Sidebar) по вакансиям, дефолтная — последняя активная
  - Тесты на API; фронт визуально



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
