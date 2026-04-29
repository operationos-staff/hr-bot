/**
 * ai-scorer.js — AI-анализ резюме через DeepSeek API
 *
 * Роль: старший тим-лид / руководитель департамента разработки.
 * Анализирует полный текст резюме с Хабра на соответствие вакансии.
 *
 * API: DeepSeek (OpenAI-совместимый)
 * Модель: deepseek-chat (~$0.014 за 1M токенов)
 */

import axios from 'axios';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const __dir = dirname(fileURLToPath(import.meta.url));

// Загружаем текст вакансии один раз при старте
let VACANCY_TEXT = '';
try {
  VACANCY_TEXT = readFileSync(join(__dir, '../../vacancy.txt'), 'utf8');
} catch {
  logger.warn('ai-scorer: vacancy.txt not found, AI scoring disabled');
}

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions';

/**
 * Скачивает PDF резюме кандидата с Хабра и извлекает текст.
 *
 * URL формат: career.habr.com/{username}.pdf
 * Пример: career.habr.com/the-ash?source=response&source_id=4509015
 *       → career.habr.com/the-ash.pdf
 *
 * PDF содержит полную информацию: Обо мне, история работы с описаниями,
 * навыки, образование — значительно больше чем HTML-страница.
 */
export async function fetchCandidateFullText(candidateUrl, cookie) {
  if (!candidateUrl) return null;

  try {
    // Извлекаем username из URL
    // Пример: https://career.habr.com/the-ash?source=response&source_id=4509015
    const urlObj = new URL(candidateUrl.startsWith('http') ? candidateUrl : `https://career.habr.com${candidateUrl}`);
    const username = urlObj.pathname.replace('/', '').trim(); // "the-ash"

    if (!username) {
      logger.warn(`ai-scorer: cannot extract username from URL: ${candidateUrl}`);
      return null;
    }

    const pdfUrl = `https://career.habr.com/${username}/print.pdf`;
    logger.debug(`ai-scorer: downloading PDF: ${pdfUrl}`);

    const res = await axios.get(pdfUrl, {
      headers: {
        Cookie: cookie,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'application/pdf,*/*',
      },
      responseType: 'arraybuffer',
      timeout: 20000,
    });

    // Проверяем что получили PDF а не HTML (редирект на логин)
    const contentType = res.headers['content-type'] || '';
    if (!contentType.includes('pdf') && !contentType.includes('octet')) {
      logger.warn(`ai-scorer: got non-PDF response for ${username} (${contentType})`);
      return null;
    }

    // Сохраняем во временный файл и парсим через pdftotext
    const tmpFile = join(tmpdir(), `habr_resume_${username}_${Date.now()}.pdf`);
    writeFileSync(tmpFile, Buffer.from(res.data));

    let text = '';
    try {
      text = execSync(`pdftotext "${tmpFile}" -`, { encoding: 'utf8', timeout: 10000 }).trim();
    } finally {
      try { unlinkSync(tmpFile); } catch { /* игнорируем */ }
    }

    if (!text || text.length < 100) {
      logger.warn(`ai-scorer: PDF text too short for ${username}`);
      return null;
    }

    logger.info(`ai-scorer: PDF loaded for ${username} (${text.length} chars)`);
    return text;
  } catch (err) {
    logger.warn(`ai-scorer: failed to fetch PDF for ${candidateUrl}: ${err.message}`);
    return null;
  }
}

/**
 * Сводка данных кандидата из raw API (Хабр-формат).
 * Pure-функция, может пригодиться отдельно — но в основном используется в buildPromptForVacancy.
 */
function buildCandidateSummary(candidateData, resumeText) {
  const apiData = candidateData.raw_data?.response?.author;
  const apiSummary = apiData ? `
Данные из профиля:
- Квалификация: ${apiData.qualification?.title || 'не указана'}
- Суммарный опыт: ${apiData.experience?.title || 'не указан'}
- Последнее место: ${apiData.lastJob?.position || '—'} @ ${apiData.lastJob?.company?.title || '—'} (${apiData.lastJob?.duration || '—'})
- Навыки: ${apiData.skills?.map(s => s.title).join(', ') || 'не указаны'}
- Языки: ${apiData.foreignLanguages?.map(l => l.title).join(', ') || 'не указаны'}
- История: ${apiData.companiesHistory?.map(c => `${c.companyName} (${c.experience})`).join('; ') || 'не указана'}
` : '';

  return resumeText
    ? `${apiSummary}\n\nПолный текст резюме:\n${String(resumeText).slice(0, 6000)}`
    : apiSummary || `Кандидат: ${candidateData.candidate_name || 'не указан'}, опыт ${candidateData.experience_years ?? '?'} лет`;
}

const DEFAULT_SYSTEM_PROMPT =
  'Ты — старший технический руководитель с 15+ летним опытом найма. Оцени резюме кандидата честно и без воды.';

const JSON_FORMAT_INSTRUCTION = `Ответь строго в формате JSON (без markdown, только JSON):
{
  "score": <число от 1 до 10>,
  "verdict": "<одна строка: Приглашать на интервью / Уточнить и пригласить / Рассмотреть / Отказать>",
  "match_level": "<Сильное совпадение / Среднее совпадение / Слабое совпадение>",
  "needs_clarification": <true|false>,
  "clarification": "<если needs_clarification=true — короткий список через ; что уточнить; иначе пустая строка>",
  "strengths": ["<сильная сторона 1>", "<сильная сторона 2>", ...],
  "concerns": ["<риск 1>", "<риск 2>", ...],
  "key_skills_match": { "<навык>": <true/false>, ... },
  "interview_questions": ["<вопрос 1>", "<вопрос 2>", "<вопрос 3>"],
  "summary": "<2-3 предложения итогового вывода о кандидате>"
}`;

const COMMON_INSTRUCTIONS = `ВАЖНО про неполные данные:
- Если резюме сильное по большинству признаков, но каких-то ключевых данных не хватает (опыт, гражданство, конкретные технологии и т.д.) — поставь "needs_clarification": true и в "clarification" перечисли через ";" что именно нужно уточнить у кандидата. Score при этом ставь честно по тому, что видно (не занижай искусственно из-за пробелов).
- Если данных хватает чтобы вынести однозначный вердикт — needs_clarification: false, clarification: "".
- Для сильных, но недосказанных кандидатов используй verdict: "Уточнить и пригласить".`;

/**
 * Собирает финальный промпт для DeepSeek по вакансии и данным кандидата.
 * Pure-функция — без сетевых вызовов, тестируется юнитами.
 *
 * @param {Object}      candidateData — application с raw_data
 * @param {string|null} resumeText    — текст резюме (PDF→text), может быть null
 * @param {Object|null} vacancy       — строка из vacancies (D1) с ai_prompt/description/title
 * @returns {string|null} собранный промпт; null если ни vacancy ни VACANCY_TEXT недоступны
 */
export function buildPromptForVacancy(candidateData, resumeText, vacancy) {
  const fullContext = buildCandidateSummary(candidateData, resumeText);

  // Выбираем источник описания вакансии и системного промпта
  let systemPrompt;
  let vacancyText;

  if (vacancy && (vacancy.ai_prompt || vacancy.description || vacancy.title)) {
    systemPrompt = vacancy.ai_prompt || DEFAULT_SYSTEM_PROMPT;
    vacancyText = vacancy.description || vacancy.title || '';
  } else if (VACANCY_TEXT) {
    // Backward-compat: vacancy не передана, но есть legacy vacancy.txt
    systemPrompt = `Ты — старший тим-лид и руководитель департамента разработки с 15+ летним опытом в международных IT-компаниях. Специализация: PHP-разработка, построение команд, найм.

Проанализируй кандидата на вакансию. Дай честную, детальную оценку как опытный технический руководитель — без воды, только по существу.`;
    vacancyText = VACANCY_TEXT;
  } else {
    // Нет ни vacancy, ни legacy-файла — собрать промпт нечем
    return null;
  }

  return `${systemPrompt}

${COMMON_INSTRUCTIONS}

=== ВАКАНСИЯ ===
${vacancyText}

=== ДАННЫЕ КАНДИДАТА ===
${fullContext}

${JSON_FORMAT_INSTRUCTION}`;
}

/**
 * Анализирует кандидата через DeepSeek API.
 * Возвращает объект с оценкой и развёрнутым разбором.
 *
 * @param {Object}      candidateData — application с raw_data
 * @param {string|null} resumeText    — текст резюме (PDF→text)
 * @param {Object|null} [vacancy]     — D1: строка из vacancies; null → fallback на VACANCY_TEXT
 */
export async function analyzeCandidate(candidateData, resumeText, vacancy = null) {
  if (!config.deepseek?.apiKey) {
    logger.debug('ai-scorer: DEEPSEEK_API_KEY not set, skipping');
    return null;
  }

  const prompt = buildPromptForVacancy(candidateData, resumeText, vacancy);
  if (!prompt) {
    logger.debug('ai-scorer: no vacancy data (vacancy + VACANCY_TEXT both empty), skipping');
    return null;
  }

  try {
    const res = await axios.post(
      DEEPSEEK_API,
      {
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1500,
      },
      {
        headers: {
          Authorization: `Bearer ${config.deepseek.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    const content = res.data.choices?.[0]?.message?.content;
    if (!content) return null;

    // Парсим JSON из ответа
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.warn('ai-scorer: failed to parse JSON from DeepSeek response');
      return null;
    }

    const analysis = JSON.parse(jsonMatch[0]);
    logger.info(`ai-scorer: scored ${candidateData.candidate_name}: ${analysis.score}/10 — ${analysis.verdict}`);
    return analysis;
  } catch (err) {
    logger.error(`ai-scorer: DeepSeek API error: ${err.message}`);
    return null;
  }
}

/**
 * Форматирует AI-анализ в текст для Telegram.
 */
export function formatAiAnalysis(analysis) {
  if (!analysis) return '';

  const scoreEmoji = analysis.score >= 8 ? '🔥' : analysis.score >= 6 ? '⭐' : analysis.score >= 4 ? '🟡' : '🔴';
  const skillsLine = Object.entries(analysis.key_skills_match || {})
    .map(([k, v]) => `${v ? '✅' : '❌'} ${k}`)
    .join(' | ');

  const strengths = (analysis.strengths || []).slice(0, 3).map(s => `  + ${s}`).join('\n');
  const concerns = (analysis.concerns || []).slice(0, 3).map(c => `  ⚠️ ${c}`).join('\n');
  const questions = (analysis.interview_questions || []).slice(0, 2).map((q, i) => `  ${i + 1}. ${q}`).join('\n');

  const clarificationBlock = analysis.needs_clarification && analysis.clarification
    ? `\n\n❗ *Уточнить у кандидата:*\n_${analysis.clarification}_`
    : '';

  return `
━━━━━━━━━━━━━━━━━━━━
🤖 *AI-оценка тим-лида*

${scoreEmoji} *Оценка: ${analysis.score}/10* — ${analysis.verdict}
📊 ${analysis.match_level}${clarificationBlock}

*Навыки:*
${skillsLine}

*Сильные стороны:*
${strengths}

*Риски:*
${concerns}

*Вопросы для интервью:*
${questions}

📝 _${analysis.summary}_
━━━━━━━━━━━━━━━━━━━━`;
}
