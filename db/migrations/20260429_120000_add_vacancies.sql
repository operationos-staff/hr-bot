-- ==========================================
-- Миграция: per-vacancy логика (D1)
-- Дата: 2026-04-29
-- Применить через: Supabase Dashboard → SQL Editor
--
-- Что делает:
--   1. Создаёт таблицу `vacancies` — вакансии как first-class объекты
--      (title, описание, AI-промпт, флаг активности, label для Telegram)
--   2. Добавляет `applications.vacancy_id` UUID FK → vacancies(id)
--   3. Сидирует первую вакансию (PHP-разработчик из vacancy.txt)
--   4. Бэкфил: проставляет vacancy_id всем существующим Habr-откликам
--      (текущая HABR_VACANCY_IDS=1000164921)
--
-- Rollback (раскомментировать и применить, чтобы откатить):
--   ALTER TABLE applications DROP COLUMN IF EXISTS vacancy_id;
--   DROP TABLE IF EXISTS vacancies;
-- ==========================================

-- 1. Таблица vacancies
CREATE TABLE IF NOT EXISTS vacancies (
  id              uuid primary key default gen_random_uuid(),

  -- Источник + ID вакансии в источнике
  source          text not null check (source in ('habr', 'hh')),
  external_id     text not null,

  -- Описание
  title           text not null,
  description     text,            -- полный текст вакансии (для людей)
  ai_prompt       text,            -- системный промпт для AI-оценщика (per-vacancy)
  telegram_label  text,            -- короткий тег для карточки в TG: «PHP», «amoCRM»

  -- Управление
  is_active       boolean not null default true,

  -- Служебные
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),

  unique (source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_vacancies_active     ON vacancies (is_active);
CREATE INDEX IF NOT EXISTS idx_vacancies_source     ON vacancies (source);
CREATE INDEX IF NOT EXISTS idx_vacancies_created_at ON vacancies (created_at DESC);

-- 2. applications.vacancy_id (nullable — старые записи не теряем)
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS vacancy_id uuid REFERENCES vacancies(id) ON DELETE NO ACTION;

CREATE INDEX IF NOT EXISTS idx_applications_vacancy_id ON applications (vacancy_id);

-- 3. RLS (по умолчанию включён, service_key обходит автоматически)
ALTER TABLE vacancies ENABLE ROW LEVEL SECURITY;

-- 4. Сидирование первой вакансии — PHP-разработчик (Хабр Карьера, ID 1000164921)
INSERT INTO vacancies (source, external_id, title, description, ai_prompt, telegram_label, is_active)
VALUES (
  'habr',
  '1000164921',
  'PHP-разработчик (middle)',
  $$📌 ВАКАНСИЯ: PHP-разработчик (middle)
Опыт работы: 3-6 лет
Полная занятость, график 5/2, 8 часов
Формат: удалённо
ЗП: от 150 000 до 250 000 руб./мес.

О компании:
Компания специализируется на продаже и организации приключенческих экскурсий по разным странам мира. Миссия — предоставлять уникальные путешествия, которые вдохновляют и обогащают жизнь клиентов.

Кого ищем:
Опытного и ответственного PHP разработчика уровня Middle, который готов стать частью формирующегося IT-отдела и принять активное участие в развитии внутренних систем и новых проектов.

Обязанности:
- Поддержка и развитие существующей ERP-системы на PHP
- Разработка новых модулей и сервисов для увеличения продаж и улучшения клиентского опыта
- Оптимизация и рефакторинг кода для повышения производительности и масштабируемости
- Участие в проектировании архитектуры новых решений
- Интеграция сторонних сервисов и API
- Взаимодействие с командой для реализации бизнес-требований

Требования (обязательно):
- Опыт коммерческой разработки на PHP от 3 лет
- PHP 8.4, понимание новых возможностей языка
- Опыт работы с Laravel, Codeigniter или Symfony
- Уверенные знания SQL, оптимизация запросов, MySQL
- Понимание ООП, паттернов проектирования (MVC, Singleton, Factory), SOLID, DRY, KISS
- Разработка RESTful API (SOAP — плюс)
- JavaScript, базовые знания Vue.js
- Git, GitFlow
- Docker, настройка окружения
- Чистый код, unit-тесты (PHPUnit)
- Agile/Scrum, Jira

Будет плюсом:
- Опыт в сфере туризма или с ERP-системами
- Redis (NoSQL)
- Микросервисная архитектура
- CI/CD (Github Actions, Jenkins)
- Linux, базовое администрирование
- Английский язык (чтение технической документации)$$,
  $$Ты — старший PHP-разработчик и тим-лид. Оцени резюме кандидата на вакансию PHP-разработчика (middle) для туристической компании с ERP-системой на PHP.

Ключевые требования (must-have):
- PHP 3+ года коммерческой разработки (PHP 8.4 — большой плюс)
- Laravel / Symfony / Codeigniter
- MySQL, оптимизация SQL
- ООП, SOLID, паттерны (MVC, Factory, Singleton)
- REST API, Git/GitFlow, Docker
- JavaScript + базы Vue.js
- PHPUnit, чистый код

Приятный бонус: туризм/ERP опыт, Redis, микросервисы, CI/CD, Linux.

Дай оценку 1-10, вердикт («Приглашать на интервью» / «Уточнить и пригласить» / «Рассмотреть позже» / «Отказать»), summary в 2-3 предложения, и при необходимости — needs_clarification + clarification (что уточнить у сильного, но недосказанного кандидата).$$,
  'PHP',
  true
)
ON CONFLICT (source, external_id) DO UPDATE SET
  title          = EXCLUDED.title,
  description    = EXCLUDED.description,
  ai_prompt      = EXCLUDED.ai_prompt,
  telegram_label = EXCLUDED.telegram_label,
  is_active      = EXCLUDED.is_active,
  updated_at     = now();

-- 5. Бэкфил: всем Habr-откликам с external_id из текущей PHP-вакансии
--    проставляем vacancy_id. Сейчас все habr-отклики идут именно с этой вакансии,
--    но фильтруем явно по source='habr', чтобы быть idempotent при повторных применениях.
UPDATE applications
SET vacancy_id = (SELECT id FROM vacancies WHERE source = 'habr' AND external_id = '1000164921')
WHERE source = 'habr'
  AND vacancy_id IS NULL;

-- 6. Шаблон для будущей amoCRM-вакансии (после одобрения HH).
--    Применять РУКАМИ через Supabase SQL Editor, когда будет известен HH vacancy_id.
--    Раскомментировать, заполнить и выполнить:
--
-- INSERT INTO vacancies (source, external_id, title, description, ai_prompt, telegram_label, is_active)
-- VALUES (
--   'hh',
--   '<HH_VACANCY_ID>',          -- из URL hh.ru/vacancy/{ID}
--   'Технический специалист (amoCRM / автоматизации)',
--   $$<полный текст вакансии>$$,
--   $$<системный промпт для AI: оцени по amoCRM, Wazzup, Tilda, телефонии, ...>$$,
--   'amoCRM',
--   true
-- ) ON CONFLICT (source, external_id) DO NOTHING;
