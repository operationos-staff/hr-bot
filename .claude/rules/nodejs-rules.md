---
globs: src/**/*.js
---

# Правила для Node.js кода (src/)

## Обязательно
- ESM only: `import`/`export`, никаких `require()` или `module.exports`
- `"type": "module"` в package.json — всегда ESM
- Логирование только через `import { logger } from '../utils/logger.js'`
- Нет `console.log`, `console.error`, `console.warn` в продакшн-коде
- Все async функции в try/catch — ошибки не крашат процесс
- `external_id` всегда `String(value)` перед сохранением в Supabase
- Поля без значений = `null` (не `undefined`, не пустая строка)
- Все URL, токены, слаги — только через `config` из `src/config.js`
- Все import-пути заканчиваются на `.js` (ESM требует расширения)

## Структура модуля
```javascript
// 1. Imports
import { ... } from '...js';

// 2. Константы (UPPER_CASE для конфигурации)
const SELECTORS = { ... };

// 3. Приватные функции (camelCase)
async function helperFn() { ... }

// 4. Экспортируемые функции
export async function publicFn() { ... }
```

## HTTP-запросы
```javascript
// Всегда с timeout и User-Agent
const res = await axios.get(url, {
  timeout: 15000,
  headers: { 'User-Agent': 'Bot_HH_Habr/1.0' }
});
```

## Запрещено
- `process.exit()` внутри модулей (только в index.js)
- Изменение `process.env` после старта
- Синхронные fs операции
- `JSON.parse` без try/catch
