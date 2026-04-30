#!/usr/bin/env node
/**
 * scripts/add-vacancy.js — интерактивное добавление вакансии в Supabase (E3).
 *
 * Запуск: npm run vacancy:add
 *
 * Спрашивает источник, vacancy_id, title, telegram_label, путь к файлу описания
 * и путь к файлу AI-промпта → делает upsertVacancy. После этого следующий
 * poll-цикл (≤5 мин) сам подхватит новую вакансию — без правки .env и
 * без pm2 restart (см. блок E2 — БД-driven список).
 *
 * Файлы description.txt и prompt.txt можно держать рядом, например в
 * ./vacancies-content/<vacancy_id>.description.txt и .prompt.txt.
 */

import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { readFileSync } from 'node:fs';
import { upsertVacancy, getVacancyBySourceExternal } from '../src/services/database.js';
import { logger } from '../src/utils/logger.js';

const rl = readline.createInterface({ input: stdin, output: stdout });

async function ask(prompt, { required = true, default: dflt = null } = {}) {
  const suffix = dflt ? ` [${dflt}]` : '';
  for (;;) {
    const value = (await rl.question(`${prompt}${suffix}: `)).trim();
    if (value) return value;
    if (dflt !== null) return dflt;
    if (!required) return '';
    console.log('  Поле обязательно, попробуй снова.');
  }
}

function readFileOrEmpty(path) {
  if (!path) return '';
  try {
    return readFileSync(path, 'utf8').trim();
  } catch (err) {
    console.error(`  ⚠️  Не удалось прочитать ${path}: ${err.message}`);
    return '';
  }
}

async function main() {
  console.log('\n🆕  Добавление новой вакансии\n');

  const source = await ask('Источник (habr/hh)', { default: 'hh' });
  if (!['habr', 'hh'].includes(source)) {
    console.error(`❌  source должен быть 'habr' или 'hh', получено: ${source}`);
    process.exit(1);
  }

  const externalId = await ask('External ID (из URL вакансии)');

  // Проверяем, нет ли уже такой
  const existing = await getVacancyBySourceExternal(source, externalId);
  if (existing) {
    console.log(`\nℹ️   Вакансия уже есть в БД: ${existing.title} (id=${existing.id}). Будет обновлена.\n`);
  }

  const title = await ask('Title (название вакансии)', { default: existing?.title || null });
  const telegramLabel = await ask('Telegram-label (короткий тег для карточек)', { default: existing?.telegram_label || null });

  const descPath = await ask('Путь к файлу описания (или пусто чтобы оставить как есть)', { required: false });
  const promptPath = await ask('Путь к файлу AI-промпта (или пусто чтобы оставить как есть)', { required: false });

  const description = descPath ? readFileOrEmpty(descPath) : (existing?.description || '');
  const aiPrompt = promptPath ? readFileOrEmpty(promptPath) : (existing?.ai_prompt || '');

  if (!description) {
    console.warn('  ⚠️  description пуст — для качественных AI-оценок рекомендуется заполнить.');
  }
  if (!aiPrompt) {
    console.warn('  ⚠️  ai_prompt пуст — будет использован дефолтный системный промпт.');
  }

  const isActiveAns = await ask('Активна (y/n)', { default: 'y' });
  const isActive = /^y(es)?$/i.test(isActiveAns);

  const summary = {
    source,
    external_id: externalId,
    title,
    telegram_label: telegramLabel,
    description: description ? `${description.length} символов` : '(пусто)',
    ai_prompt: aiPrompt ? `${aiPrompt.length} символов` : '(пусто)',
    is_active: isActive,
  };
  console.log('\nЧто будет сохранено:\n', summary, '\n');

  const confirm = await ask('Сохранить (y/n)', { default: 'y' });
  if (!/^y(es)?$/i.test(confirm)) {
    console.log('Отмена.');
    rl.close();
    return;
  }

  try {
    await upsertVacancy({
      source,
      external_id: externalId,
      title,
      description,
      ai_prompt: aiPrompt,
      telegram_label: telegramLabel,
      is_active: isActive,
    });
    console.log(`\n✅  Готово. Поллер подхватит вакансию в течение 5 минут.`);
  } catch (err) {
    console.error(`\n❌  Ошибка сохранения: ${err.message}`);
    logger.error(`add-vacancy: ${err.message}`);
    process.exit(1);
  }

  rl.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
