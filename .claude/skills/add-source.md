# Skill: add-source

Используй этот навык когда нужно добавить новый источник откликов (например, SuperJob, LinkedIn).

## Workflow

1. **Создать спецификацию** нового источника по шаблону TECH_SPEC.md Модуль 1/2
2. **Создать** `src/sources/{name}.js` по образцу habr.js или hh.js
3. **Обязательный интерфейс** (должен экспортировать):
```javascript
export async function getNew{Name}Applications(isNewFn) {
  // Возвращает массив объектов с полями:
  // source, external_id, candidate_name, candidate_url,
  // vacancy_title, citizenship, experience_raw, position,
  // location, cover_letter, received_at, raw_data
}
```
4. **Добавить вызов** в poller.js рядом с habr/hh блоками
5. **Добавить переменные окружения** в .env.example и config.js
6. **Обновить TECH_SPEC.md** — добавить новый модуль
7. **Обновить CLAUDE.md** — добавить источник в архитектурную схему
8. **Создать субагент** `.claude/agents/{name}-parser.md` для нового источника

## Контракт источника
- `source` литерал строго соответствует значению в CHECK constraint Supabase
- При добавлении нового source: обновить `CHECK (source IN ('habr', 'hh', '{новый}'))`
- Делегировать database-architect для обновления схемы
- Делегировать qa-reviewer для ревью нового модуля
