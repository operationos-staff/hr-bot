# Bot_HH_Habr — AI Config

## Обзор
Бот фильтрации откликов на вакансии. Хабр Карьера (cookie-парсинг) + HH.ru (OAuth API).
Фильтр: гражданство РФ + опыт ≥5 лет. Вывод: Telegram-канал + Google Sheets + Supabase.
Деплой: VPS vm7377, PM2/systemd. Фаза 1 = Хабр. Фаза 2 = HH.

## Стек
- Node.js 20+ ESM (`"type": "module"`)
- cheerio (HTML парсинг), axios (HTTP), winston (логи)
- @supabase/supabase-js, googleapis, node-cron
- Supabase self-hosted: supabase.assisthelp.ru

## Архитектура
```
src/index.js → src/workers/poller.js (оркестратор, setInterval)
  ├── src/sources/habr.js   (парсер кабинета, cookie-авторизация)
  ├── src/sources/hh.js     (HH API + OAuth refresh)
  ├── src/services/filter.js (✅/🟡/❌ по гражданству и опыту)
  ├── src/services/telegram.js (карточки в канал)
  ├── src/services/sheets.js   (append в Google Sheets)
  └── src/services/database.js (Supabase CRUD + дедуп)
src/config.js — все env через require_env(), ESM
src/utils/logger.js — winston, src/utils/helpers.js — parseExperience, normalize
```

## Правила кода
- Только ESM: `import`/`export`, никаких `require()`
- Логи только через `logger.*`, не `console.log` в продакшне
- Все HTTP в try/catch — ошибка одного источника не крашит процесс
- `external_id` всегда String() перед сохранением
- Поля null (не undefined) в Supabase
- CSS-селекторы Хабра централизованы в константе `SELECTORS` в habr.js
- Без хардкода: все токены/URL только через `config`
- Никогда не удалять записи из БД — только флаги (qualified, processed)

## Фильтрация
```
citizenship: 'RU' → ✅ | 'OTHER' → ❌ | null → 🟡
experience_years: ≥5 → ✅ | <5 → ❌ | null → 🟡
Один ❌ → отклик не отправляется | Оба null → 🟡
```

## БД (Supabase)
- `applications`: UNIQUE(source, external_id), qualified: boolean|null
- `oauth_tokens`: provider='hh', access+refresh+expires_at
- `processing_log`: статистика циклов
- RLS enabled, service_key обходит автоматически

## Команды
```bash
npm start              # продакшн запуск
npm run dev            # разработка с --watch
npm run test:habr      # тест парсера Хабра
npm run test:hh        # тест HH клиента
pm2 start deploy/ecosystem.config.cjs --env production
pm2 logs bot-hh-habr
```

## Субагенты (в .claude/agents/)
- `database-architect` — схема, миграции, RLS, индексы
- `backend-engineer` — sources, services, workers
- `habr-parser` — специалист по habr.js и CSS-селекторам
- `hh-api-client` — HH OAuth, refresh токенов
- `qa-reviewer` — ревью без Write/Edit

## Оркестрация (поведение агента)
- Для любой задачи 3+ шагов — сначала план в `tasks/todo.md` с чекбоксами
- Субагентов использовать щедро: разведка, анализ, параллельные задачи — на них
- Одна задача — один субагент (фокус контекста)
- Задача не «готово», пока не доказана: тест, лог, проверка результата
- После правки от пользователя — обновить `tasks/lessons.md` с паттерном ошибки
- Перечитывать `tasks/lessons.md` в начале сессии
- Если что-то идёт не так — СТОП, перепланировать, не продолжать наугад

## Управление задачами
- `tasks/todo.md` — план с чекбоксами, обновляется по ходу работы
- `tasks/lessons.md` — уроки из правок, чтобы не повторять ошибки

## Детали
- Полная спецификация: TECH_SPEC.md
- Идея и контекст: PROJECT_IDEA.md
- Первый запуск: SETUP.md
- Шаблон фичи: SPEC_TEMPLATE.md
- Поведенческий стандарт агента: AGENTS.md
