-- ==========================================
-- Bot_HH_Habr — Схема БД Supabase
-- Применить через: Supabase Dashboard → SQL Editor
-- ==========================================

-- Включаем расширение для UUID
create extension if not exists "pgcrypto";

-- ==========================================
-- Таблица откликов на вакансии
-- ==========================================
create table if not exists applications (
  id              uuid primary key default gen_random_uuid(),

  -- Источник и идентификация
  source          text not null check (source in ('habr', 'hh')),
  external_id     text not null,

  -- Данные кандидата
  candidate_name  text,
  candidate_url   text,
  application_url text,
  vacancy_title   text,
  position        text,         -- должность из резюме
  location        text,
  cover_letter    text,

  -- Фильтруемые параметры
  citizenship     text,         -- 'RU' | 'OTHER' | null
  citizenship_raw text,         -- исходная строка из источника
  experience_years numeric,     -- лет (с десятичной дробью)

  -- Результат фильтрации
  qualified       boolean,      -- true=✅ false=❌ null=🟡
  filter_reason   text,         -- причина отклонения или пометки

  -- Служебные поля
  raw_data        jsonb,        -- полный сырой объект (для дебага и пересчёта)
  received_at     timestamptz,  -- дата отклика по данным источника
  created_at      timestamptz default now(),

  -- Дедупликация
  unique (source, external_id)
);

-- Индексы
create index if not exists idx_applications_source      on applications (source);
create index if not exists idx_applications_qualified   on applications (qualified);
create index if not exists idx_applications_created_at  on applications (created_at desc);
create index if not exists idx_applications_citizenship on applications (citizenship);

-- ==========================================
-- Таблица OAuth токенов (для HH)
-- ==========================================
create table if not exists oauth_tokens (
  provider        text primary key,   -- 'hh'
  access_token    text not null,
  refresh_token   text not null,
  expires_at      timestamptz not null,
  updated_at      timestamptz default now()
);

-- ==========================================
-- Таблица лога обработки (опционально)
-- ==========================================
create table if not exists processing_log (
  id          uuid primary key default gen_random_uuid(),
  cycle_at    timestamptz default now(),
  source      text,
  total_found int default 0,
  total_new   int default 0,
  qualified   int default 0,
  filtered    int default 0,
  uncertain   int default 0,
  error_msg   text,
  duration_ms int
);

-- ==========================================
-- Row Level Security (если нужно)
-- Для service_key доступ полный, для anon — нет
-- ==========================================
alter table applications    enable row level security;
alter table oauth_tokens    enable row level security;
alter table processing_log  enable row level security;

-- Политика: только service role имеет полный доступ
-- (service_key в коде обходит RLS автоматически)

-- ==========================================
-- Полезные запросы для мониторинга
-- ==========================================

-- Статистика за сегодня:
-- select source, qualified, count(*) from applications
-- where created_at > now() - interval '24 hours'
-- group by source, qualified order by source, qualified;

-- Последние 20 откликов:
-- select created_at, source, qualified, candidate_name, citizenship, experience_years, filter_reason
-- from applications order by created_at desc limit 20;

-- Подходящие кандидаты за последнюю неделю:
-- select * from applications
-- where qualified = true and created_at > now() - interval '7 days'
-- order by created_at desc;
