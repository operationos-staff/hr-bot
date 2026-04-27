---
globs: deploy/*, .env*, package.json
---

# Правила деплоя и конфигурации

## .env / config.js
- Обязательные переменные: SUPABASE_URL, SUPABASE_SERVICE_KEY, TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHANNEL_ID, GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_JSON, HABR_COOKIE, HABR_COMPANY_SLUG
- HH_* переменные необязательны — пустая строка = HH-модуль отключён
- require_env() бросает Error при старте если обязательная переменная отсутствует
- .env никогда не коммитится (в .gitignore)
- google-service-account.json никогда не коммитится

## PM2 (ecosystem.config.cjs)
- max_memory_restart: '256M'
- restart_delay: 10000 (10 сек)
- Логи в ./logs/ (директория должна существовать)
- CJS расширение (.cjs) обязательно для PM2 конфига в ESM-проекте

## systemd (bot-hh-habr.service)
- EnvironmentFile указывает на .env
- User=ubuntu (не root)
- Restart=always, RestartSec=10s
- После изменения: `systemctl daemon-reload && systemctl restart bot-hh-habr`

## package.json
- "type": "module" — обязательно
- Скрипты: start, dev, test:habr, test:hh
- engines.node: ">=20.0.0"
