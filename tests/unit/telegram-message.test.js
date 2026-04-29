/**
 * TDD: src/services/telegram.js — buildMessage с per-vacancy префиксом (D4)
 *
 * Развилка решена: один Telegram-канал, разделение через текст карточки.
 * Каждая карточка начинается с `[Вакансия: <label>]`, чтобы при подключении
 * второй вакансии (HH amoCRM) в одном канале не было путаницы.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage } from '../../src/services/telegram.js';

// ============================================================
// Фикстуры
// ============================================================
const APP_QUALIFIED = {
  source: 'habr',
  external_id: '1',
  candidate_name: 'Иван Петров',
  position: 'Senior PHP Developer',
  vacancy_title: 'PHP-разработчик (middle)',
  location: 'Москва',
  citizenship: 'RU',
  experience_years: 7,
  cover_letter: null,
  qualified: true,
  filter_reason: null,
};

const APP_UNCERTAIN = {
  ...APP_QUALIFIED,
  external_id: '2',
  qualified: null,
  filter_reason: 'опыт',
};

const VACANCY_PHP = {
  id: 'v-php',
  title: 'PHP-разработчик (middle)',
  telegram_label: 'PHP',
};

const VACANCY_AMOCRM = {
  id: 'v-amo',
  title: 'Технический специалист (amoCRM / автоматизации)',
  telegram_label: 'amoCRM',
};

// ============================================================
// buildMessage с vacancy
// ============================================================
describe('buildMessage — per-vacancy префикс (D4)', () => {

  test('vacancy задана → карточка начинается с [Вакансия: <label>]', () => {
    const text = buildMessage(APP_QUALIFIED, VACANCY_PHP);
    assert.ok(text.startsWith('[Вакансия: PHP]'),
      `карточка должна начинаться с "[Вакансия: PHP]", got: "${text.slice(0, 40)}..."`);
  });

  test('telegram_label в приоритете перед title (короче для канала)', () => {
    const text = buildMessage(APP_QUALIFIED, VACANCY_PHP);
    assert.ok(text.includes('[Вакансия: PHP]'));
    assert.ok(!text.startsWith('[Вакансия: PHP-разработчик'),
      'должен использоваться короткий telegram_label, не title');
  });

  test('telegram_label отсутствует → fallback на vacancy.title', () => {
    const v = { id: 'x', title: 'Backend Senior', telegram_label: null };
    const text = buildMessage(APP_QUALIFIED, v);
    assert.ok(text.startsWith('[Вакансия: Backend Senior]'));
  });

  test('vacancy = null → префикс НЕ добавляется (backward-compat)', () => {
    const text = buildMessage(APP_QUALIFIED, null);
    assert.ok(!text.startsWith('[Вакансия:'),
      `без vacancy префикс не нужен, got: "${text.slice(0, 40)}..."`);
    // Старая логика: первая строка — emoji + статус
    assert.ok(text.startsWith('✅'), 'без vacancy первый символ = emoji статуса');
  });

  test('разные вакансии → разные префиксы в одном канале', () => {
    const phpText = buildMessage(APP_QUALIFIED, VACANCY_PHP);
    const amoText = buildMessage(APP_QUALIFIED, VACANCY_AMOCRM);

    assert.ok(phpText.startsWith('[Вакансия: PHP]'));
    assert.ok(amoText.startsWith('[Вакансия: amoCRM]'));
    assert.notEqual(phpText, amoText);
  });

  test('префикс сохраняется для 🟡 (qualified=null)', () => {
    const text = buildMessage(APP_UNCERTAIN, VACANCY_PHP);
    assert.ok(text.startsWith('[Вакансия: PHP]'));
    assert.ok(text.includes('🟡'));
  });

  test('основное содержимое карточки сохранилось', () => {
    const text = buildMessage(APP_QUALIFIED, VACANCY_PHP);
    assert.ok(text.includes('Иван Петров'));
    assert.ok(text.includes('Senior PHP Developer'));
    assert.ok(text.includes('Москва'));
    assert.ok(text.includes('🇷🇺'));
    assert.ok(text.includes('7 лет'));
  });

  test('vacancy без title и без telegram_label → префикс не добавляется', () => {
    const empty = { id: 'empty' };
    const text = buildMessage(APP_QUALIFIED, empty);
    assert.ok(!text.startsWith('[Вакансия:'));
  });
});
