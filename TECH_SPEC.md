# TECH_SPEC.md — Техническая спецификация Bot_HH_Habr

> Слой 2 по методологии Spec-First.
> Каждый модуль описан так, что субагент может реализовать его без уточнений.

---

## Модуль 1 — Парсер Хабр Карьеры (`src/sources/habr.js`)

### User Stories
1. Как воркер, я хочу получать список новых откликов с Хабра каждые 5 минут, чтобы оперативно обрабатывать кандидатов
2. Как воркер, я хочу получать данные резюме (гражданство, опыт) для каждого нового отклика, чтобы применить фильтр
3. Как воркер, я хочу корректно обрабатывать протухший cookie, чтобы не падать тихо, а слать алерт
4. Как воркер, я хочу пропускать уже виденные отклики (по external_id), чтобы не дублировать уведомления
5. Как разработчик, я хочу иметь все CSS-селекторы в одном месте (`SELECTORS`), чтобы обновить их за 1 минуту при изменении вёрстки Хабра

### Модель данных (входящий объект от парсера)
```typescript
HabrApplication {
  source: 'habr'                       // литерал
  external_id: string                  // data-response-id или fallback на candidate_url
  candidate_name: string | null        // имя из страницы откликов
  candidate_url: string | null         // /resumes/{id} или /users/{slug}
  application_url: string              // URL страницы откликов (для ссылки)
  vacancy_title: string | null         // название вакансии
  citizenship: string | null           // сырая строка из резюме ("Россия", "Казахстан", etc)
  experience_raw: string | null        // сырая строка опыта ("7 лет", "3 года 6 месяцев")
  position: string | null              // должность из h1 резюме
  location: string | null              // город из резюме
  cover_letter: string | null          // сопроводительное (если доступно)
  received_at: string                  // ISO 8601
  raw_data: { resp: object, resumeData: object }
}
```

### Логика парсинга
**Шаг 1 — Список откликов**
- GET `https://career.habr.com/companies/{HABR_COMPANY_SLUG}/responses?page={n}`
- Заголовки: `Cookie`, `User-Agent`, `Referer`
- Детект протухшего cookie: URL содержит `/login` ИЛИ body содержит `Войти`
- При детекте: бросить `Error('Habr: cookie expired')` — поймает poller.js и отправит alert
- Парсить `SELECTORS.responseItem` → для каждого элемента: `external_id`, `candidate_url`, `candidate_name`, `vacancy_title`

**Шаг 2 — Страница резюме**
- GET полный URL резюме
- Пауза `REQUEST_DELAY_MS` перед каждым запросом
- Парсить: `citizenship` (блок "Гражданство"), `experience_raw` (блок "Опыт работы"), `position` (h1), `location`
- Если парсер не нашёл поле — вернуть `null`, не бросать ошибку

**SELECTORS — константа в начале файла, централизованная:**
```javascript
const SELECTORS = {
  responseItem: '[data-response-id], .response-item',
  candidateLink: 'a[href*="/resumes/"], a[href*="/users/"]',
  vacancyTitle: '.vacancy-title, [class*="vacancy"] a',
  citizenshipBlock: '[class*="additional"] >> Гражданство',  // описание поиска
  experienceTotal: '[class*="experience-total"], [class*="total-experience"]',
  position: 'h1[class*="title"], h1[class*="resume"]',
  location: '[class*="location"], [class*="city"]',
};
```

### Крайние случаи
- `external_id` не найден → использовать `candidate_url` как ID; если и его нет → пропустить отклик, залогировать warn
- Страница резюме вернула 404 → вернуть `{}`, залогировать warn, не прерывать цикл
- Парсер не нашёл ни одного отклика на странице → вернуть `[]`, НЕ кидать ошибку
- Сеть недоступна → axios выбросит `ECONNREFUSED` → поймает poller.js, залогирует error

---

## Модуль 2 — HH.ru API клиент (`src/sources/hh.js`)

### User Stories
1. Как воркер, я хочу получать новые отклики через HH API без ручной авторизации
2. Как воркер, я хочу, чтобы access_token автоматически обновлялся до истечения срока
3. Как воркер, я хочу получать данные резюме (гражданство, опыт) через `/resumes/{id}`
4. Как разработчик, я хочу хранить токены в Supabase, а не только в `.env`

### Модель данных (входящий объект)
```typescript
HHApplication {
  source: 'hh'
  external_id: string                  // String(negotiation.id)
  candidate_name: string               // first_name + last_name
  candidate_url: string | null         // resume.alternate_url
  application_url: string | null       // negotiation.alternate_url
  vacancy_title: string | null         // vacancy.name
  citizenship: string | null           // citizenship[].name через запятую
  experience_raw: number | null        // total_experience.months (число)
  position: string | null              // resume.title
  location: string | null              // area.name
  cover_letter: string | null          // negotiation.message
  received_at: string                  // negotiation.created_at
}
```

### API эндпоинты HH (используемые)
| Метод | Путь | Описание |
|---|---|---|
| GET | `/negotiations/employer` | Список переговоров работодателя |
| GET | `/resumes/{id}` | Резюме кандидата |
| POST | `/token` | Обновление access_token |

**Параметры `/negotiations/employer`:**
- `employer_id` = `HH_EMPLOYER_ID`
- `per_page` = 50
- `page` = 0
- `order_by` = `updated_at`

### Логика авто-рефреша токена
1. При 401 от любого запроса → вызвать `refreshAccessToken()`
2. POST `/token` с `grant_type=refresh_token`, `refresh_token`, `client_id`, `client_secret`
3. Сохранить новые токены в Supabase (`oauth_tokens` WHERE provider='hh')
4. Повторить оригинальный запрос с новым токеном
5. Если refresh тоже вернул 401 → бросить ошибку, поллер пропустит цикл HH

### Крайние случаи
- `HH_EMPLOYER_ID` пустой → пропустить модуль молча (`logger.info('HH: not configured')`), вернуть `[]`
- `total_experience` отсутствует в резюме → `experience_raw = null`
- `citizenship` — пустой массив → `citizenship = null`
- HH вернул 429 → залогировать warn, вернуть `[]` (не крашить)

---

## Модуль 3 — Фильтр (`src/services/filter.js`)

### User Stories
1. Как воркер, я хочу классифицировать каждый отклик на ✅/🟡/❌, чтобы принять решение о уведомлении
2. Как аналитик, я хочу знать причину отклонения для каждого ❌, чтобы позже пересмотреть фильтры

### Бизнес-логика (строгая, без отклонений)
```
normalizeCitizenship(raw):
  'россия' | 'russia' | '113' → 'RU'
  любая другая строка           → 'OTHER'
  null / undefined / ''         → null

parseExperienceYears(raw):
  number → Math.round(raw / 12 * 10) / 10  (raw = месяцы, формат HH)
  string → извлечь годы * 12 + месяцы, вернуть years с 1 знаком
  null   → null

filterApplication(candidate):
  IF citizenship === 'OTHER'         → { qualified: false, reason: 'Гражданство: {raw}' }
  IF experience_years < 5            → { qualified: false, reason: 'Опыт {n} лет < 5' }
  IF citizenship === null            → добавить в issues 'гражданство не указано'
  IF experience_years === null       → добавить в issues 'опыт не указан'
  IF issues.length > 0               → { qualified: null,  reason: 'Нет данных: {issues}' }
  ELSE                               → { qualified: true,  reason: null }
```

### Возвращаемый объект
```typescript
FilterResult {
  qualified: boolean | null    // true=✅ false=❌ null=🟡
  filter_reason: string | null
  citizenship: 'RU' | 'OTHER' | null
  experience_years: number | null
}
```

### Крайние случаи
- Оба параметра null → `qualified: null` (🟡), reason = 'Нет данных: гражданство не указано, опыт не указан'
- Гражданство OTHER + опыт null → `qualified: false` (❌) — достаточно одного несоответствия
- Опыт 5.0 лет ровно → `qualified: true` (граница включительно)
- Строка "менее года" → `experience_years = 0.5` → `qualified: false`

---

## Модуль 4 — Telegram-уведомления (`src/services/telegram.js`)

### User Stories
1. Как HR, я хочу получать карточку отклика в Telegram с кнопкой ссылкой на оригинал
2. Как HR, я хочу чётко различать ✅/🟡 отклики по заголовку карточки
3. Как администратор, я хочу получать алерты о технических проблемах (cookie, сбои)

### Формат карточки ✅
```
✅ Новый отклик — Хабр Карьера

👤 Иван Иванов
💼 Senior Backend Developer
🏢 Вакансия: DevOps Engineer
📍 Москва | 🇷🇺 Россия
⏱ Опыт: 7 лет

📝 "Готов рассмотреть ваше предложение..."

[Открыть на Хабре →]
```

### Формат карточки 🟡
```
🟡 Отклик (нет данных: гражданство не указано) — Хабр Карьера

👤 Пётр Петров
💼 —
🏢 Вакансия: DevOps Engineer
📍 Санкт-Петербург | 🌍 не указано
⏱ Опыт: не указан

[Открыть на Хабре →]
```

### API вызовы
- `POST https://api.telegram.org/bot{TOKEN}/sendMessage`
- `parse_mode: 'Markdown'`
- `disable_web_page_preview: true`
- `reply_markup.inline_keyboard` — кнопка с URL
- Лимит text: 4096 символов; cover_letter обрезается до 300 символов через `truncate()`

### Крайние случаи
- `qualified === false` → НЕ отправлять, только логировать debug
- Telegram вернул 429 (rate limit) → подождать `retry_after` секунд и повторить один раз
- Telegram вернул 403 → залогировать error (бот не добавлен в канал)
- `candidate_url` отсутствует → карточка без кнопки (не ломать)

---

## Модуль 5 — Google Sheets (`src/services/sheets.js`)

### User Stories
1. Как HR, я хочу видеть всех ✅ и 🟡 кандидатов в живой таблице с телефона
2. Как администратор, я хочу, чтобы заголовки создавались автоматически при первом запуске

### Структура таблицы (лист "Подходящие")
| Колонка | Тип | Источник |
|---|---|---|
| A: Дата получения | string | `new Date().toLocaleString('ru-RU', {timeZone: 'Europe/Moscow'})` |
| B: Статус | string | `✅ Подходит` / `🟡 Проверить` |
| C: Источник | string | `Хабр Карьера` / `HeadHunter` |
| D: Имя кандидата | string | `candidate_name` |
| E: Должность | string | `position` |
| F: Вакансия | string | `vacancy_title` |
| G: Локация | string | `location` |
| H: Гражданство | string | `Россия` / raw значение |
| I: Опыт (лет) | number | `experience_years` |
| J: Причина пометки | string | `filter_reason` (пусто если ✅) |
| K: Ссылка | url | `candidate_url` |

### API операции
- `spreadsheets.values.append` — добавить строку, `valueInputOption: 'USER_ENTERED'`
- `spreadsheets.values.get` — проверить наличие заголовков (range A1)
- `spreadsheets.values.update` — записать заголовки если A1 пустая

### Крайние случаи
- `qualified === false` → не добавлять строку
- Google Sheets вернул 429 → retry через 2 секунды, один раз
- Нет доступа (403) → залогировать error, не падать (Sheets опционален)
- `experience_years` = `null` → записать пустую строку `''`

---

## Модуль 6 — База данных (`src/services/database.js`)

### Таблицы Supabase

#### `applications`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
source          text NOT NULL CHECK (source IN ('habr', 'hh'))
external_id     text NOT NULL
candidate_name  text
candidate_url   text
application_url text
vacancy_title   text
position        text
location        text
cover_letter    text
citizenship     text                      -- 'RU' | 'OTHER' | null
citizenship_raw text                      -- исходная строка
experience_years numeric                  -- лет, 1 знак после запятой
qualified       boolean                   -- true/false/null
filter_reason   text
raw_data        jsonb
received_at     timestamptz
created_at      timestamptz DEFAULT now()
UNIQUE (source, external_id)
```

RLS: `enabled` — service_key обходит автоматически, anon доступа нет

#### `oauth_tokens`
```sql
provider        text PRIMARY KEY              -- 'hh'
access_token    text NOT NULL
refresh_token   text NOT NULL
expires_at      timestamptz NOT NULL
updated_at      timestamptz DEFAULT now()
```

#### `processing_log`
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
cycle_at        timestamptz DEFAULT now()
source          text
total_found     int DEFAULT 0
total_new       int DEFAULT 0
qualified       int DEFAULT 0
filtered        int DEFAULT 0
uncertain       int DEFAULT 0
error_msg       text
duration_ms     int
```

### Функции модуля
| Функция | Вход | Выход | Ошибки |
|---|---|---|---|
| `isApplicationExists(source, externalId)` | string, string | boolean | false при DB ошибке |
| `saveApplication(app)` | объект Application | void | throw при non-23505 ошибке |
| `saveHHTokens({accessToken, refreshToken, expiresAt})` | объект | void | throw |
| `getHHTokens()` | — | TokenRow \| null | null при ошибке |

### Крайние случаи
- INSERT с UNIQUE violation (23505) → тихо пропустить, залогировать debug
- Supabase недоступен → `isApplicationExists` вернёт `false` (отклик обработается как новый, но UNIQUE в БД защитит от дубля)

---

## Модуль 7 — Оркестратор (`src/workers/poller.js`)

### User Stories
1. Как система, я хочу запускать полный цикл опроса всех источников каждые 5 минут
2. Как система, я хочу, чтобы ошибка одного источника не останавливала обработку другого
3. Как аналитик, я хочу видеть статистику каждого цикла в логах

### Логика цикла `runPollCycle()`
```
1. Запустить таймер
2. TRY: getNewHabrApplications(isNew) → массив
   CATCH: логировать error; если 'cookie expired' → sendAlert
3. Для каждого HabrApplication:
   TRY: processApplication(app)
   CATCH: логировать error, продолжить
4. TRY: getNewHHApplications(isNew) → массив (если HH настроен)
   CATCH: логировать error
5. Для каждого HHApplication: processApplication(app)
6. Залогировать статистику: source, total_new, qualified, filtered, uncertain, duration_ms
7. Опционально: saveProcessingLog(stats)
```

### `processApplication(raw)` — обрабатывает один отклик
```
1. filterApplication(raw) → FilterResult
2. Собрать объект Application из raw + FilterResult
3. saveApplication(app) → Supabase
4. IF qualified !== false: sendApplicationCard(app) → Telegram
5. IF qualified !== false: appendQualifiedCandidate(app) → Sheets
6. Залогировать: icon + source/id + candidate_name
```

### Крайние случаи
- Цикл занял дольше `POLL_INTERVAL_MS` → следующий цикл запустится немедленно после завершения (setInterval с флагом `isRunning`)
- `processApplication` выбросил ошибку → залогировать, перейти к следующему отклику
- 0 новых откликов за цикл → залогировать info, ничего не делать

---

## Модуль 8 — Конфигурация (`src/config.js`)

### Переменные окружения
| Переменная | Тип | Обязательная | По умолчанию | Описание |
|---|---|---|---|---|
| `SUPABASE_URL` | string | ✅ | — | `https://supabase.assisthelp.ru` |
| `SUPABASE_SERVICE_KEY` | string | ✅ | — | JWT service role key |
| `TELEGRAM_BOT_TOKEN` | string | ✅ | — | Токен бота от BotFather |
| `TELEGRAM_CHANNEL_ID` | string | ✅ | — | `-100xxxxxxxxxx` |
| `GOOGLE_SHEETS_ID` | string | ✅ | — | ID таблицы из URL |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | string | ✅ | `./google-service-account.json` | Путь к JSON |
| `GOOGLE_SHEET_NAME_QUALIFIED` | string | — | `Подходящие` | Имя листа |
| `HABR_COOKIE` | string | ✅ | — | Полная строка Cookie |
| `HABR_COMPANY_SLUG` | string | ✅ | — | Слаг из URL кабинета |
| `HABR_PAGES_TO_CHECK` | number | — | `2` | Страниц за цикл |
| `HH_CLIENT_ID` | string | — | `''` | Пусто = HH отключён |
| `HH_CLIENT_SECRET` | string | — | `''` | |
| `HH_ACCESS_TOKEN` | string | — | `''` | |
| `HH_REFRESH_TOKEN` | string | — | `''` | |
| `HH_EMPLOYER_ID` | string | — | `''` | |
| `POLL_INTERVAL_MS` | number | — | `300000` | 5 минут |
| `REQUEST_DELAY_MS` | number | — | `1500` | Пауза между запросами резюме |
| `LOG_LEVEL` | string | — | `info` | error/warn/info/debug |
| `NODE_ENV` | string | — | `development` | |

### Поведение при старте
- Обязательные переменные: если отсутствует → `throw new Error('Missing: {KEY}')` → процесс не стартует
- HH переменные: необязательные, пустая строка = HH-модуль пропускается молча

---

## Зависимости между модулями

```
index.js
  └── poller.js
        ├── habr.js     (читает config, helpers)
        ├── hh.js       (читает config, database для токенов)
        ├── filter.js   (читает helpers)
        ├── telegram.js (читает config, helpers)
        ├── sheets.js   (читает config)
        └── database.js (читает config)

config.js ← читается всеми модулями
logger.js ← используется всеми модулями
helpers.js ← используется filter.js, habr.js, telegram.js
```

---

## Чеклист готовности модуля (для субагентов)

Перед завершением работы над любым модулем проверить:
- [ ] Нет `console.log` — только `logger.*`
- [ ] Все HTTP-запросы в try/catch, ошибки не крашат процесс
- [ ] Тип `external_id` всегда приводится к `String()` перед сохранением
- [ ] Поля с null корректно сериализуются в Supabase (не `undefined`)
- [ ] Нет хардкода URL/токенов — только через `config`
- [ ] ESM: только `import`/`export`, никаких `require()`
