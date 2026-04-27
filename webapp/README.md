# Bot_HH_Habr — Telegram Mini App

Премиальный фронтенд для бота откликов: рейтинг, дэшборд, отклики, настройки.

## Стек

React 18 · TypeScript · Vite · Tailwind · React Query · Recharts · Lucide.

## Локальный запуск

```bash
cd webapp
npm install
cp .env.example .env.local
# Прописать VITE_API_BASE_URL=https://api.example.com
npm run dev
```

Откроется на `http://localhost:5173`. Для разработки **без Telegram-обёртки** на бэке выставь `API_AUTH_DISABLED=1` (только локально!).

## Деплой на Cloudflare Pages

1. Зайти в Cloudflare → **Workers & Pages → Create → Pages → Connect to Git** (или прямой загрузкой dist).
2. **Build command:** `npm run build`
3. **Build output directory:** `dist`
4. **Root directory:** `webapp`
5. **Environment variables:**
   - `VITE_API_BASE_URL=https://api.example.com`
6. Деплой → получаем URL вида `https://hr-bot.pages.dev`

## Привязка к Telegram

1. **@BotFather** → `/myapps` → **New Web App**
2. Выбрать твоего бота → задать имя/иконку
3. **Web App URL:** `https://hr-bot.pages.dev`
4. **Short name** (например `hr`) → `t.me/<bot>/hr` будет открывать Mini App
5. Также Mini App открывается из inline-кнопки в карточках откликов и в pinned-рейтинге.

## Авторизация

Каждый запрос отправляет `X-Telegram-Init-Data` (значение `window.Telegram.WebApp.initData`).
Бэкенд:
1. Валидирует HMAC-SHA256 от bot token (`src/api/auth.js`).
2. Сверяет `user.id` с `WEBAPP_ALLOWED_USER_IDS` в `.env`.

## Структура

```
src/
  main.tsx, App.tsx          ─ корень + роутинг
  components/
    Layout.tsx, BottomNav.tsx
    PageHeader.tsx, CandidateCard.tsx
    ui/  (Card, Badge, Button, Skeleton, Empty, ScoreRing, Avatar)
  pages/
    RankingPage.tsx          ─ топ кандидатов
    DashboardPage.tsx        ─ KPI + графики
    ApplicationsPage.tsx     ─ список с фильтрами
    CandidateDetailPage.tsx  ─ карточка
    SettingsPage.tsx         ─ настройки
  lib/
    api.ts                   ─ HTTP-клиент с initData
    telegram.ts              ─ обёртка Telegram WebApp SDK
    types.ts, utils.ts
```
