# SETUP — Пошаговый гайд по запуску

## Что делаем в каком порядке

```
Шаг 1: Подготовка внешних сервисов (разово)
  ├── 1.1 Cookie Хабра
  ├── 1.2 Telegram бот + канал
  ├── 1.3 Google Sheets + сервисный аккаунт
  └── 1.4 Supabase — применить схему БД

Шаг 2: Настройка кода
  ├── 2.1 Клонировать/скопировать проект на VPS
  ├── 2.2 npm install
  └── 2.3 Заполнить .env

Шаг 3: Запуск
  ├── Вариант A: Node.js напрямую (тест)
  ├── Вариант B: PM2 (продакшн)
  └── Вариант C: n8n workflow (альтернатива)

Шаг 4: Проверка
```

---

## Шаг 1.1 — Cookie Хабра

1. Открыть браузер, зайти на `career.habr.com` под аккаунтом работодателя
2. Открыть страницу откликов: `career.habr.com/companies/{SLUG}/responses`
3. Открыть DevTools: `F12` → вкладка **Network**
4. Обновить страницу (`F5`)
5. Кликнуть на любой запрос к `career.habr.com` в списке
6. В правой панели → вкладка **Headers** → раздел **Request Headers**
7. Найти строку `Cookie:` и скопировать всё значение целиком
8. Также записать слаг компании из URL: `career.habr.com/companies/**{SLUG}**/responses`

> **Когда обновлять:** Cookie протухает обычно через несколько недель. Бот пришлёт алерт в канал если это произойдёт.

---

## Шаг 1.2 — Telegram бот и канал

### Создать бота:
1. Открыть `@BotFather` в Telegram
2. Отправить `/newbot`
3. Задать имя (например `HH Habr Отклики`) и username (например `hh_habr_responses_bot`)
4. Скопировать **токен** — он выглядит как `1234567890:AAFxxxxxxx`

### Создать канал и подключить бота:
1. Создать приватный Telegram-канал
2. Зайти в настройки канала → **Администраторы** → добавить бота как администратора (права: публикация сообщений)
3. Узнать `chat_id` канала:
   - Отправить любое сообщение в канал
   - Открыть в браузере: `https://api.telegram.org/bot{ТОКЕН}/getUpdates`
   - Найти в JSON поле `"chat": {"id": -100XXXXXXXXXX}` — это и есть `chat_id`

---

## Шаг 1.3 — Google Sheets

### Создать таблицу:
1. Открыть Google Sheets, создать новую таблицу
2. Переименовать Sheet1 → **Подходящие**
3. Добавить второй лист → **Отфильтрованные** (опционально)
4. Скопировать ID таблицы из URL: `docs.google.com/spreadsheets/d/**{ID}**/edit`

### Создать сервисный аккаунт Google:
1. Открыть [Google Cloud Console](https://console.cloud.google.com/)
2. Создать проект (или выбрать существующий)
3. **APIs & Services** → **Enabled APIs** → включить **Google Sheets API**
4. **APIs & Services** → **Credentials** → **Create Credentials** → **Service Account**
5. Задать имя сервисного аккаунта, нажать **Create**
6. На странице сервисного аккаунта → вкладка **Keys** → **Add Key** → **JSON**
7. Скачается файл — переименовать в `google-service-account.json` и положить в корень проекта

### Дать доступ к таблице:
1. Открыть скачанный JSON файл, найти поле `"client_email": "xxx@xxx.iam.gserviceaccount.com"`
2. Открыть таблицу Google Sheets → **Поделиться** → добавить этот email с правами **Редактор**

---

## Шаг 1.4 — Supabase: схема БД

1. Открыть `supabase.assisthelp.ru` → Dashboard
2. Выбрать проект → **SQL Editor**
3. Вставить содержимое файла `db/schema.sql`
4. Нажать **Run**

Получить `service_key`:
- **Project Settings** → **API** → **Service Role Key** (не `anon key`!)

---

## Шаг 2.1 — Код на VPS

```bash
# Подключиться к VPS
ssh ubuntu@vm7377

# Клонировать проект (или скопировать через scp/rsync)
git clone https://github.com/your-repo/Bot_HH_Habr.git
# или
scp -r ./Bot_HH_Habr ubuntu@vm7377:/home/ubuntu/

cd /home/ubuntu/Bot_HH_Habr

# Установить зависимости
npm install

# Создать .env из шаблона
cp .env.example .env
nano .env  # заполнить все значения

# Положить JSON сервисного аккаунта Google
# (скопировать файл google-service-account.json в корень проекта)
```

---

## Шаг 2.2 — Заполнить .env

```bash
nano /home/ubuntu/Bot_HH_Habr/.env
```

Заполнить все поля согласно `.env.example`. Обязательные для Фазы 1 (Хабр):
- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHANNEL_ID`
- `GOOGLE_SHEETS_ID` + `GOOGLE_SERVICE_ACCOUNT_JSON`
- `HABR_COOKIE` + `HABR_COMPANY_SLUG`

---

## Шаг 3A — Тестовый запуск

```bash
cd /home/ubuntu/Bot_HH_Habr
node src/index.js
```

Смотреть логи в консоли. Если всё ок — перейти к Шагу 3B.

---

## Шаг 3B — PM2 (продакшн)

```bash
# Установить PM2 глобально (если нет)
npm install -g pm2

# Запустить
pm2 start deploy/ecosystem.config.cjs --env production

# Сохранить и настроить автозапуск при рестарте VPS
pm2 save
pm2 startup  # выполнить команду которую покажет pm2

# Мониторинг
pm2 status
pm2 logs bot-hh-habr
pm2 monit
```

---

## Шаг 3C — n8n Workflow (альтернатива)

1. Открыть n8n → **Workflows** → **Import from file**
2. Выбрать `n8n/habr_workflow.json`
3. Настроить Credentials:
   - **Supabase PostgreSQL**: добавить connection string к Supabase
   - **Telegram Bot**: токен бота
   - **Google Sheets**: OAuth или сервисный аккаунт
4. Добавить Environment Variables в n8n:
   - `HABR_COOKIE` — строка cookie
   - `HABR_COMPANY_SLUG` — слаг компании
   - `TELEGRAM_CHANNEL_ID`
   - `GOOGLE_SHEETS_ID`
5. **Activate** workflow

> ⚠️ n8n workflow требует адаптации HTML-парсера под реальную вёрстку Хабра.

---

## Шаг 4 — Проверка

После запуска через 5 минут должен сработать первый цикл:

1. Проверить логи: `pm2 logs bot-hh-habr` или консоль
2. В Supabase: `SELECT * FROM applications ORDER BY created_at DESC LIMIT 5;`
3. В Telegram-канале: должны появиться карточки ✅/🟡 откликов
4. В Google Sheets: должны появиться строки с кандидатами

---

## Частые проблемы

| Проблема | Причина | Решение |
|---|---|---|
| "Cookie expired" в логах | Протух cookie Хабра | Обновить `HABR_COOKIE` в `.env`, перезапустить |
| "0 responses found" | Неверный `HABR_COMPANY_SLUG` или изменилась вёрстка | Проверить URL кабинета, обновить CSS-селекторы в `habr.js` |
| "Telegram: 403 Forbidden" | Бот не добавлен в канал | Добавить бота как администратора |
| "Sheets: 403" | Нет доступа к таблице | Поделиться таблицей с email сервисного аккаунта |
| Дубли в Supabase | Ошибка в `external_id` | Проверить парсер `habr.js`, поле `external_id` |

---

## Следующий шаг: Фаза 2 — HeadHunter

После стабильной работы Хабра:

1. Зарегистрировать приложение на [dev.hh.ru](https://dev.hh.ru/)
2. Получить `client_id` / `client_secret`
3. Пройти OAuth-флоу для работодателя, получить начальные токены
4. Заполнить HH-поля в `.env`
5. Код `src/sources/hh.js` уже готов — просто начнёт работать
