/**
 * Отправляет рейтинг топ кандидатов в Telegram
 * Запуск: node scripts/top-candidates.js
 * Можно добавить в cron для ежедневного отчёта
 */

import 'dotenv/config';
import axios from 'axios';
import { getTopCandidates } from '../src/services/database.js';
import { config } from '../src/config.js';

async function sendTopRanking() {
  const candidates = await getTopCandidates(15);

  if (!candidates.length) {
    console.log('Нет кандидатов с AI-оценкой');
    return;
  }

  const scoreEmoji = (score) => {
    if (score >= 9) return '🔥';
    if (score >= 8) return '⭐';
    if (score >= 7) return '👍';
    if (score >= 5) return '🟡';
    return '🔴';
  };

  const lines = candidates.map((c, i) => {
    const rank = i + 1;
    const exp = c.experience_years ? `${c.experience_years}л` : '?л';
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}.`;
    return `${medal} *${c.candidate_name}* ${scoreEmoji(c.ai_score)} ${c.ai_score}/10\n   ${c.position || '—'} · ${exp} · ${c.ai_verdict || '—'}`;
  });

  const text = `🏆 *Рейтинг кандидатов на PHP Middle*\nТоп ${candidates.length} по оценке тим-лида\n\n${lines.join('\n\n')}`;

  await axios.post(
    `https://api.telegram.org/bot${config.telegram.token}/sendMessage`,
    {
      chat_id: config.telegram.channelId,
      text,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
    }
  );

  console.log(`✅ Рейтинг отправлен (${candidates.length} кандидатов)`);
  candidates.forEach((c, i) => {
    console.log(`${i+1}. ${c.candidate_name} — ${c.ai_score}/10 — ${c.ai_verdict}`);
  });
}

sendTopRanking().catch(console.error);
