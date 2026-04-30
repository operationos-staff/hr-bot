/**
 * TDD: src/sources/hh-normalizer.js — formatHHResumeAsText (D8)
 *
 * Конвертирует JSON-резюме HH (/resumes/{id}) в связный русский текст,
 * пригодный для AI-оценщика. Покрывает: основные поля, история работы,
 * образование, навыки, языки, fallback на пустые поля.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { formatHHResumeAsText } from '../../src/sources/hh-normalizer.js';

const FULL_RESUME = {
  id: 'r1',
  first_name: 'Иван',
  last_name: 'Петров',
  middle_name: 'Сергеевич',
  age: 35,
  gender: { name: 'Мужской' },
  area: { name: 'Москва' },
  citizenship: [{ name: 'Россия' }],
  title: 'Технический специалист amoCRM',
  total_experience: { months: 84 },
  salary: { amount: 50000, currency: 'RUR' },
  experience: [
    {
      start: '2020-03', end: null,
      company: 'Острова Сокровищ',
      position: 'CRM-специалист',
      description: 'Настройка amoCRM, интеграции Wazzup, Tilda, телефонии.',
    },
    {
      start: '2018-01', end: '2020-02',
      company: 'Acme',
      position: 'Junior amoCRM dev',
      description: 'Базовая настройка воронок.',
    },
  ],
  education: {
    primary: [
      { name: 'МГУ', organization: 'ВМК', result: 'Computer Science', year: 2017 },
    ],
  },
  skill_set: ['amoCRM', 'JavaScript', 'PHP', 'Git'],
  language: [
    { name: 'Русский', level: { name: 'Родной' } },
    { name: 'English', level: { name: 'Intermediate' } },
  ],
  key_skills: [{ name: 'Customer support' }, { name: 'Triggers / Sensei' }],
};

describe('formatHHResumeAsText — полное резюме', () => {

  test('возвращает строку (не объект)', () => {
    const text = formatHHResumeAsText(FULL_RESUME);
    assert.equal(typeof text, 'string');
    assert.ok(text.length > 100);
  });

  test('содержит ФИО и возраст', () => {
    const text = formatHHResumeAsText(FULL_RESUME);
    assert.ok(text.includes('Иван'));
    assert.ok(text.includes('Петров'));
    assert.ok(text.includes('35'));
  });

  test('содержит локацию и гражданство', () => {
    const text = formatHHResumeAsText(FULL_RESUME);
    assert.ok(text.includes('Москва'));
    assert.ok(text.includes('Россия'));
  });

  test('содержит желаемую позицию (title)', () => {
    const text = formatHHResumeAsText(FULL_RESUME);
    assert.ok(text.includes('Технический специалист amoCRM'));
  });

  test('содержит общий опыт работы (months → лет)', () => {
    const text = formatHHResumeAsText(FULL_RESUME);
    // 84 месяцев = 7 лет
    assert.ok(/7\s*лет|7\s*год/i.test(text), `expected "7 лет", got: ${text.slice(0, 200)}`);
  });

  test('содержит полную историю работы с описаниями', () => {
    const text = formatHHResumeAsText(FULL_RESUME);
    assert.ok(text.includes('Острова Сокровищ'));
    assert.ok(text.includes('CRM-специалист'));
    assert.ok(text.includes('Настройка amoCRM, интеграции Wazzup'));
    assert.ok(text.includes('Acme'));
    assert.ok(text.includes('Junior amoCRM dev'));
  });

  test('содержит образование', () => {
    const text = formatHHResumeAsText(FULL_RESUME);
    assert.ok(text.includes('МГУ'));
    assert.ok(text.includes('Computer Science'));
  });

  test('содержит навыки', () => {
    const text = formatHHResumeAsText(FULL_RESUME);
    assert.ok(text.includes('amoCRM'));
    assert.ok(text.includes('JavaScript'));
    assert.ok(text.includes('PHP'));
  });

  test('содержит ключевые навыки', () => {
    const text = formatHHResumeAsText(FULL_RESUME);
    assert.ok(text.includes('Customer support'));
    assert.ok(text.includes('Triggers / Sensei'));
  });

  test('содержит языки', () => {
    const text = formatHHResumeAsText(FULL_RESUME);
    assert.ok(text.includes('English'));
    assert.ok(text.includes('Intermediate'));
  });
});

describe('formatHHResumeAsText — частичные данные', () => {

  test('null-вход → пустая строка', () => {
    assert.equal(formatHHResumeAsText(null), '');
    assert.equal(formatHHResumeAsText(undefined), '');
  });

  test('пустой объект → строка но без падений', () => {
    const text = formatHHResumeAsText({});
    assert.equal(typeof text, 'string');
    // Никаких throws на пустом объекте
  });

  test('только базовые поля без истории/образования', () => {
    const text = formatHHResumeAsText({
      first_name: 'Анна',
      last_name: 'Иванова',
      area: { name: 'Спб' },
      title: 'amoCRM-developer',
    });
    assert.ok(text.includes('Анна'));
    assert.ok(text.includes('Иванова'));
    assert.ok(text.includes('Спб'));
    assert.ok(text.includes('amoCRM-developer'));
  });
});
