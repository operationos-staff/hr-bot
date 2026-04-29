import 'dotenv/config';

function require_env(key) {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env variable: ${key}`);
  return val;
}

export const config = {
  supabase: {
    url: require_env('SUPABASE_URL'),
    serviceKey: require_env('SUPABASE_SERVICE_KEY'),
  },
  telegram: {
    token: require_env('TELEGRAM_BOT_TOKEN'),
    channelId: require_env('TELEGRAM_CHANNEL_ID'),
  },
  sheets: {
    spreadsheetId: process.env.GOOGLE_SHEETS_ID || '', // опционально — без него Sheets просто не пишется
    serviceAccountJson: process.env.GOOGLE_SERVICE_ACCOUNT_JSON || './google-service-account.json',
    sheetQualified: process.env.GOOGLE_SHEET_NAME_QUALIFIED || 'Подходящие',
    sheetFiltered: process.env.GOOGLE_SHEET_NAME_FILTERED || 'Отфильтрованные',
    sheetRanking:  process.env.GOOGLE_SHEET_NAME_RANKING || 'Рейтинг',
  },
  ranking: {
    // Период учёта в рейтинге — кандидаты с received_at >= rankingSince
    since: process.env.RANKING_SINCE || '2026-04-20T00:00:00Z',
    limit: parseInt(process.env.RANKING_LIMIT || '50', 10),
    // Топ N показывается в Telegram pinned-сообщении
    telegramTop: parseInt(process.env.RANKING_TELEGRAM_TOP || '15', 10),
  },
  api: {
    // HTTP-API для Telegram Mini App
    port: parseInt(process.env.API_PORT || '3001', 10),
    host: process.env.API_HOST || '0.0.0.0',
    publicUrl: process.env.WEBAPP_URL || '',  // публичный HTTPS-URL Mini App (Cloudflare Pages)
    // Whitelist Telegram user_id, через запятую: "12345,67890"
    allowedUserIds: (process.env.WEBAPP_ALLOWED_USER_IDS || '')
      .split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite),
    // Разрешённые источники CORS, через запятую (например, https://hr-bot.pages.dev,https://hr.example.com)
    allowedOrigins: (process.env.WEBAPP_ALLOWED_ORIGINS || '')
      .split(',').map(s => s.trim()).filter(Boolean),
    authDisabled: process.env.API_AUTH_DISABLED === '1',
  },
  habr: {
    cookie: require_env('HABR_COOKIE'),
    // ID вакансий через запятую: "1000164921,1000123456"
    // Находится в URL страницы вакансии: career.habr.com/vacancies/{ID}
    vacancyIds: (process.env.HABR_VACANCY_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
    pagesToCheck: parseInt(process.env.HABR_PAGES_TO_CHECK || '5', 10),
  },
  hh: {
    clientId: process.env.HH_CLIENT_ID || '',
    clientSecret: process.env.HH_CLIENT_SECRET || '',
    accessToken: process.env.HH_ACCESS_TOKEN || '',
    refreshToken: process.env.HH_REFRESH_TOKEN || '',
    employerId: process.env.HH_EMPLOYER_ID || '',
    // ID вакансий через запятую: "999000111,888777666"
    // Пусто → один общий запрос /negotiations/employer без vacancy_id
    vacancyIds: (process.env.HH_VACANCY_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
    // OAuth Redirect URI — должен совпадать с тем, что зарегистрирован в HH-приложении.
    redirectUri: process.env.HH_REDIRECT_URI || 'https://api.assisthelp.ru/hh/callback',
  },
  worker: {
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || '300000', 10),
    requestDelayMs: parseInt(process.env.REQUEST_DELAY_MS || '1500', 10),
  },
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    // Анализировать только кандидатов с qualified=true или null (не отказников)
    analyzeQualified: true,
  },
  logLevel: process.env.LOG_LEVEL || 'info',
  nodeEnv: process.env.NODE_ENV || 'development',
};
