---
globs: db/**/*.sql, src/services/database.js
---

# Правила для работы с БД

## SQL-миграции
- Имя файла: `db/migrations/YYYYMMDD_HHMMSS_описание.sql`
- Всегда идемпотентны: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- Каждая миграция содержит rollback-секцию в комментарии
- UUID PK: `DEFAULT gen_random_uuid()` (не SERIAL, не AUTO_INCREMENT)
- Временные поля: `timestamptz` (не `timestamp`, не `datetime`)
- Enum-значения: через `CHECK` constraint, не отдельная таблица для малых списков

## Supabase / database.js
- Использовать `@supabase/supabase-js` с `service_key` — не `anon_key`
- `service_key` обходит RLS автоматически
- При INSERT UNIQUE violation (код 23505) — тихо пропустить, logger.debug
- При других ошибках — throw (пусть poller обработает)
- Функции возвращают null при ошибке чтения, throw при ошибке записи

## Дедупликация
- Проверка через `isApplicationExists(source, externalId)` ПЕРЕД тяжёлым парсингом резюме
- Уникальность: UNIQUE(source, external_id) в БД — финальная защита
- Обе проверки обязательны (код + БД)

## Запрещено
- DELETE на таблице applications
- UPDATE qualified поля без логирования причины
- Хранение секретов в БД в незашифрованном виде (кроме oauth_tokens — они нужны)
