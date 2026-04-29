/**
 * Заглушка для случая, когда фронт открыт ВНЕ Telegram (старая legacy-карточка
 * в канале вела на vercel-домен напрямую, Telegram открыл во внешнем браузере).
 *
 * Без initData все API-запросы возвращают 401 → пустой экран.
 * Показываем понятную инструкцию вместо пустоты.
 */

import { ExternalLink } from 'lucide-react';

const BOT_USERNAME = 'trat_hr_bot';
const MINIAPP_SHORT = 'hr_app';

export function OutsideTelegramGate() {
  const directLink = `https://t.me/${BOT_USERNAME}/${MINIAPP_SHORT}`;
  return (
    <div className="min-h-screen flex items-center justify-center bg-tg-bg p-6">
      <div className="max-w-md w-full rounded-2xl border border-tg-border bg-tg-surface p-6 shadow-soft text-center">
        <div className="text-5xl mb-3">🔐</div>
        <h1 className="text-xl font-bold text-tg-text mb-2">
          Mini App работает только в Telegram
        </h1>
        <p className="text-sm text-tg-hint mb-5">
          Это HR-панель кандидатов. Чтобы увидеть данные, открой Mini App
          через бота — там всё подгрузится автоматически.
        </p>

        <a
          href={directLink}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-tg-accent px-5 py-3 text-sm font-semibold text-white hover:opacity-90 transition"
        >
          <ExternalLink size={16} /> Открыть в Telegram
        </a>

        <p className="mt-5 text-xs text-tg-hint">
          Или найди бота{' '}
          <a className="text-tg-link underline" href={`https://t.me/${BOT_USERNAME}`}>
            @{BOT_USERNAME}
          </a>{' '}
          в Telegram.
        </p>
      </div>
    </div>
  );
}
