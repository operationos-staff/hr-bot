/**
 * Второй Supabase-клиент — для clon2 (Остров Сокровищ).
 *
 * Этот бот живёт в собственной БД (applications), а clon2 ведёт воронку
 * найма в своей БД (candidates). Чтобы по нажатию кнопки HR в Telegram
 * добавлять отклик в воронку Острова — нужен второй клиент.
 *
 * Lazy-init: если CLON2_SUPABASE_URL/KEY не заданы, бот стартует штатно
 * (просто кнопка «В воронку» не добавляется в карточки).
 */

import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let client = null;
let warned = false;

export function isClon2Configured() {
  return Boolean(config.clon2.supabaseUrl && config.clon2.supabaseKey);
}

export function getClon2Client() {
  if (!isClon2Configured()) {
    if (!warned) {
      logger.warn('CLON2_SUPABASE_URL/KEY не заданы — кнопка «В воронку Острова» отключена.');
      warned = true;
    }
    return null;
  }
  if (!client) {
    client = createClient(config.clon2.supabaseUrl, config.clon2.supabaseKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    logger.info(`Clon2 Supabase client initialized: ${config.clon2.supabaseUrl}`);
  }
  return client;
}
