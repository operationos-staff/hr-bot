/**
 * Переотправка карточки кандидата в Telegram
 * Запуск: node scripts/resend-card.js
 */

import 'dotenv/config';
import { sendApplicationCard, sendAiAnalysis } from '../src/services/telegram.js';
import { fetchCandidateFullText, analyzeCandidate, formatAiAnalysis } from '../src/services/ai-scorer.js';
import { config } from '../src/config.js';

const CANDIDATE = {
  source: 'habr',
  external_id: '4509015',
  candidate_name: 'Антон Шанауров',
  candidate_url: 'https://career.habr.com/the-ash?source=response&source_id=4509015',
  application_url: 'https://career.habr.com/the-ash?source=response&source_id=4509015',
  vacancy_title: 'PHP-разработчик (middle)',
  position: 'Старший бэкенд разработчик',
  location: 'Москва',
  citizenship: 'Россия',
  experience_raw: 117, // месяцев
  cover_letter: null,
  qualified: null, // 🟡 (гражданство не было указано напрямую в API)
  filter_reason: 'гражданство не указано',
  experience_years: 9.8,
  raw_data: {
    response: {
      author: {
        qualification: { title: 'Senior' },
        experience: { title: '9 лет и 9 месяцев', value: 117 },
        lastJob: { position: 'Старший бэкенд разработчик', company: { title: 'Металлинвестбанк' }, duration: '2 года и 6 месяцев' },
        skills: [
          { title: 'PHP' }, { title: 'Битрикс24' }, { title: 'Laravel' },
          { title: 'ООП' }, { title: 'SQL' }, { title: 'MySQL' }, { title: 'Git' },
          { title: 'Docker' }, { title: 'Redis' }, { title: 'Vue.js' }
        ],
        companiesHistory: [
          { companyName: 'Металлинвестбанк', experience: '2 года и 6 месяцев' },
          { companyName: 'Полюс Диджитал', experience: '7 месяцев' },
          { companyName: 'Alpina Digital', experience: '1 год и 7 месяцев' },
        ],
      }
    }
  }
};

async function main() {
  console.log(`Переотправляю карточку: ${CANDIDATE.candidate_name}`);

  // 1. Карточка кандидата
  await sendApplicationCard(CANDIDATE);
  console.log('✅ Карточка отправлена');

  // 2. AI-анализ
  if (config.deepseek?.apiKey) {
    console.log('Загружаю PDF и анализирую...');
    const resumeText = await fetchCandidateFullText(CANDIDATE.candidate_url, config.habr.cookie);
    const analysis = await analyzeCandidate(CANDIDATE, resumeText);
    if (analysis) {
      const formatted = formatAiAnalysis(analysis);
      await sendAiAnalysis(CANDIDATE, formatted);
      console.log('✅ AI-анализ отправлен');
    }
  }

  console.log('Готово!');
}

main().catch(console.error);
