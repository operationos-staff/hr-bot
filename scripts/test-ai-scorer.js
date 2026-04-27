/**
 * Тест AI-анализа на одном кандидате
 * Запуск: node scripts/test-ai-scorer.js
 */

import 'dotenv/config';
import axios from 'axios';
import { fetchCandidateFullText, analyzeCandidate, formatAiAnalysis } from '../src/services/ai-scorer.js';
import { config } from '../src/config.js';

// Берём Антона Шанаурова (the-ash) — он уже прошёл наш фильтр ✅
const TEST_CANDIDATE = {
  candidate_name: 'Антон Шанауров',
  candidate_url: 'https://career.habr.com/the-ash?source=response&source_id=4509015',
  external_id: '4509015',
  source: 'habr',
  raw_data: {
    response: {
      author: {
        qualification: { title: 'Senior' },
        experience: { title: '9 лет и 9 месяцев', value: 117 },
        lastJob: { position: 'Старший бэкенд разработчик', company: { title: 'Металлинвестбанк' }, duration: '2 года и 6 месяцев' },
        skills: [
          { title: 'PHP' }, { title: 'Битрикс24' }, { title: 'Laravel' },
          { title: 'CMS «1С-Битрикс»' }, { title: 'ООП' }, { title: 'Веб-разработка' },
          { title: 'SQL' }, { title: 'REST' }, { title: 'MySQL' }, { title: 'Git' }
        ],
        companiesHistory: [
          { companyName: 'Металлинвестбанк', experience: '2 года и 6 месяцев' },
          { companyName: 'Полюс Диджитал', experience: '7 месяцев' },
          { companyName: 'Alpina Digital', experience: '1 год и 7 месяцев' },
        ],
        foreignLanguages: [],
      }
    }
  }
};

async function main() {
  console.log('=== Тест AI-анализа резюме ===\n');
  console.log(`Кандидат: ${TEST_CANDIDATE.candidate_name}`);
  console.log(`Ключ DeepSeek: ${config.deepseek?.apiKey ? '✅ задан' : '❌ не задан'}\n`);

  // Шаг 1: загрузить полный текст резюме
  console.log('1. Загружаю профиль с Хабра...');
  const resumeText = await fetchCandidateFullText(
    TEST_CANDIDATE.candidate_url,
    config.habr.cookie
  );

  if (resumeText) {
    console.log(`✅ Получен текст (${resumeText.length} символов)`);
    console.log('Превью:\n', resumeText.slice(0, 500), '\n...\n');
  } else {
    console.log('⚠️ Текст резюме не получен, используем только данные API\n');
  }

  // Шаг 2: анализ через DeepSeek
  console.log('2. Анализирую через DeepSeek...');
  const analysis = await analyzeCandidate(TEST_CANDIDATE, resumeText);

  if (analysis) {
    console.log('\n✅ Анализ получен:');
    console.log(JSON.stringify(analysis, null, 2));

    console.log('\n=== ФОРМАТИРОВАННЫЙ ВЫВОД ДЛЯ TELEGRAM ===');
    console.log(formatAiAnalysis(analysis));
  } else {
    console.log('❌ Анализ не получен');
  }
}

main().catch(console.error);
