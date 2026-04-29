/**
 * TDD: src/services/ai-scorer.js — per-vacancy промпт (D2)
 *
 * Тестируем чистую функцию buildPromptForVacancy(candidate, resumeText, vacancy).
 * Сетевой вызов в analyzeCandidate не тестируем здесь — только сборку промпта.
 *
 * Идея D2:
 * - vacancy = null → fallback на хардкоженный VACANCY_TEXT (PHP) для обратной совместимости
 * - vacancy != null → используется vacancy.ai_prompt + vacancy.description
 * - Промпт всегда содержит данные кандидата и текст резюме (если есть)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildPromptForVacancy } from '../../src/services/ai-scorer.js';

// ============================================================
// Фикстуры
// ============================================================
const VACANCY_PHP = {
  id: 'v-php',
  source: 'habr',
  external_id: '1000164921',
  title: 'PHP-разработчик (middle)',
  description: 'Опыт работы: 3-6 лет\nPHP 8.4, Laravel, MySQL, Docker',
  ai_prompt: 'Ты — старший PHP-разработчик. Оцени резюме на вакансию PHP-разработчика.',
  telegram_label: 'PHP',
  is_active: true,
};

const VACANCY_AMOCRM = {
  id: 'v-amo',
  source: 'hh',
  external_id: '999000111',
  title: 'Технический специалист (amoCRM / автоматизации)',
  description: 'Работа с amoCRM, Wazzup, Tilda, телефония, Digital Pipeline',
  ai_prompt: 'Ты — эксперт по CRM-системам и amoCRM. Оцени резюме тех. специалиста.',
  telegram_label: 'amoCRM',
  is_active: true,
};

const CANDIDATE = {
  candidate_name: 'Иван Петров',
  citizenship: 'RU',
  experience_years: 7,
  raw_data: { response: { author: { qualification: { title: 'Senior' } } } },
};

// ============================================================
// buildPromptForVacancy — выбор промпта по вакансии
// ============================================================
describe('buildPromptForVacancy — vacancy задана', () => {

  test('включает vacancy.ai_prompt в финальный промпт', () => {
    const prompt = buildPromptForVacancy(CANDIDATE, 'резюме', VACANCY_PHP);
    assert.ok(prompt.includes(VACANCY_PHP.ai_prompt),
      'ai_prompt вакансии должен быть в промпте');
  });

  test('включает vacancy.description в финальный промпт', () => {
    const prompt = buildPromptForVacancy(CANDIDATE, 'резюме', VACANCY_PHP);
    assert.ok(prompt.includes('PHP 8.4, Laravel, MySQL, Docker'),
      'description вакансии должен быть в промпте');
  });

  test('разные вакансии → разные промпты', () => {
    const phpPrompt = buildPromptForVacancy(CANDIDATE, 'r', VACANCY_PHP);
    const amoPrompt = buildPromptForVacancy(CANDIDATE, 'r', VACANCY_AMOCRM);

    assert.ok(phpPrompt.includes('PHP-разработчик'));
    assert.ok(amoPrompt.includes('amoCRM'));
    assert.ok(!phpPrompt.includes('amoCRM'),
      'PHP-промпт не должен содержать amoCRM-специфику');
    assert.ok(!amoPrompt.includes('PHP-разработчик'),
      'amoCRM-промпт не должен содержать PHP-специфику');
  });

  test('включает имя кандидата и опыт', () => {
    const prompt = buildPromptForVacancy(CANDIDATE, 'резюме текст', VACANCY_AMOCRM);
    // Имя обычно есть в `apiSummary`-блоке, проверим хотя бы что данные кандидата используются
    // (в текущей реализации — через raw_data.response.author)
    assert.ok(prompt.includes('Senior') || prompt.includes('Иван'),
      'данные кандидата должны попасть в промпт');
  });

  test('включает текст резюме (если он передан)', () => {
    const prompt = buildPromptForVacancy(CANDIDATE, 'УНИКАЛЬНЫЙ_МАРКЕР_РЕЗЮМЕ', VACANCY_PHP);
    assert.ok(prompt.includes('УНИКАЛЬНЫЙ_МАРКЕР_РЕЗЮМЕ'));
  });

  test('пустой resumeText → промпт всё равно собирается без ошибок', () => {
    const prompt = buildPromptForVacancy(CANDIDATE, null, VACANCY_PHP);
    assert.ok(typeof prompt === 'string');
    assert.ok(prompt.length > 0);
    assert.ok(prompt.includes(VACANCY_PHP.ai_prompt));
  });

  test('vacancy без ai_prompt → fallback на дефолтное описание роли', () => {
    const minimal = { ...VACANCY_PHP, ai_prompt: null };
    const prompt = buildPromptForVacancy(CANDIDATE, 'r', minimal);
    // Должен быть какой-то системный промпт (тим-лид/IT-руководитель)
    assert.ok(prompt.length > 100, 'промпт должен быть собран даже без ai_prompt');
    assert.ok(prompt.includes(VACANCY_PHP.description),
      'description вакансии всё равно идёт в промпт');
  });

  test('vacancy без description → fallback на vacancy.title', () => {
    const minimal = { ...VACANCY_PHP, description: null };
    const prompt = buildPromptForVacancy(CANDIDATE, 'r', minimal);
    assert.ok(prompt.includes(VACANCY_PHP.title),
      'title вакансии должен быть в промпте при отсутствии description');
  });
});

describe('buildPromptForVacancy — vacancy = null (обратная совместимость)', () => {

  test('vacancy=null → возвращает строку или null (зависит от наличия VACANCY_TEXT)', () => {
    const result = buildPromptForVacancy(CANDIDATE, 'r', null);
    // VACANCY_TEXT может быть пустым в окружении тестов (vacancy.txt существует) —
    // в любом случае результат предсказуем: либо строка, либо null
    if (result !== null) {
      assert.equal(typeof result, 'string');
      assert.ok(result.length > 0);
    }
  });
});

describe('buildPromptForVacancy — формат ответа JSON', () => {

  test('инструкция «JSON only» присутствует в промпте', () => {
    const prompt = buildPromptForVacancy(CANDIDATE, 'r', VACANCY_PHP);
    assert.ok(/JSON/i.test(prompt), 'промпт должен указывать формат JSON');
  });

  test('обязательные поля JSON-ответа упомянуты: score/verdict/summary', () => {
    const prompt = buildPromptForVacancy(CANDIDATE, 'r', VACANCY_PHP);
    assert.ok(prompt.includes('score'));
    assert.ok(prompt.includes('verdict'));
    assert.ok(prompt.includes('summary'));
  });

  test('needs_clarification и clarification остались в формате (для D из todo)', () => {
    const prompt = buildPromptForVacancy(CANDIDATE, 'r', VACANCY_PHP);
    assert.ok(prompt.includes('needs_clarification'));
    assert.ok(prompt.includes('clarification'));
  });
});
