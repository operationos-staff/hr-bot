---
globs: src/services/filter.js, src/utils/helpers.js
---

# Правила логики фильтрации

## Эта логика — ядро системы. Изменения требуют обновления TECH_SPEC.md.

## Таблица решений (строгая, не менять без явного запроса)
| citizenship | experience | Результат |
|---|---|---|
| 'RU' | ≥5 лет | ✅ qualified=true |
| 'RU' | <5 лет | ❌ qualified=false |
| 'RU' | null | 🟡 qualified=null |
| 'OTHER' | любой | ❌ qualified=false |
| null | ≥5 лет | 🟡 qualified=null |
| null | <5 лет | ❌ qualified=false |
| null | null | 🟡 qualified=null |

## normalizeCitizenship(raw)
- 'россия', 'russia', '113', 'RU' (case-insensitive) → 'RU'
- Любая другая непустая строка → 'OTHER'
- null / undefined / '' → null

## parseExperienceYears(raw)
- number → Math.round(raw / 12 * 10) / 10 (raw = месяцы, формат HH API)
- string → парсить "(N лет)? (M месяцев)?", вернуть суммарно в годах, 1 знак
- 'менее года', 'меньше года' → 0.5
- null / undefined / непарсируемая строка → null

## Граничные условия
- experience_years === 5.0 → ✅ (граница включительно, ≥5)
- experience_years === 4.9 → ❌
- Оба параметра null → 🟡 (не ❌!)
- 'OTHER' + null опыт → ❌ (достаточно одного несоответствия для ❌)

## Запрещено
- Менять логику без обновления TECH_SPEC.md Модуль 3
- Добавлять новые параметры фильтрации без явного запроса пользователя
- Возвращать `undefined` — только `null`, `true`, `false`
