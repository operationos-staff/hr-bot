# Skill: update-parser

Используй этот навык когда Хабр изменил вёрстку и парсер перестал работать.

## Симптомы проблемы
- В логах: "found 0 responses on page 1"
- В логах: ошибки парсинга полей (citizenship, experience)
- Карточки приходят с пустыми полями

## Workflow диагностики

1. **Сохранить реальный HTML** страницы откликов:
```bash
curl -b "$HABR_COOKIE" \
  "https://career.habr.com/companies/$HABR_COMPANY_SLUG/responses" \
  -H "User-Agent: Mozilla/5.0" \
  -o /tmp/habr_responses.html
```

2. **Найти блоки откликов**:
```bash
grep -n 'data-response-id\|response-item\|candidate-link' /tmp/habr_responses.html | head -20
```

3. **Сохранить HTML резюме** (взять URL из ответа шага 1)

4. **Найти блоки данных**:
```bash
grep -n 'Гражданство\|Опыт работы\|experience\|citizenship' /tmp/habr_resume.html | head -20
```

5. **Обновить SELECTORS** в habr.js — только константу, не логику функций

6. **Протестировать** `npm run test:habr`

7. **Проверить** что null возвращается (не undefined, не пустая строка) для ненайденных полей

## Правило
Никогда не менять логику извлечения данных — только CSS-селекторы в SELECTORS.
Если данные парсятся но в другом формате — обновлять helpers.js (parseExperienceYears, normalizeCitizenship).
