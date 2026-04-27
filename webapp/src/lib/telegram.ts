/**
 * Тонкая обёртка над window.Telegram.WebApp.
 *
 * Не падает если запущено вне Telegram (для разработки в обычном браузере) —
 * подставляет no-op версии.
 */

interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

interface TgWebApp {
  initData: string;
  initDataUnsafe: { user?: TgUser; start_param?: string; query_id?: string; auth_date?: number };
  themeParams: Record<string, string>;
  colorScheme: 'light' | 'dark';
  platform?: string;
  version?: string;
  ready: () => void;
  expand: () => void;
  close: () => void;
  openLink: (url: string, opts?: { try_instant_view?: boolean }) => void;
  openTelegramLink: (url: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
    selectionChanged: () => void;
  };
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  MainButton?: {
    text: string;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
    setText: (t: string) => void;
  };
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  enableClosingConfirmation?: () => void;
  disableVerticalSwipes?: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TgWebApp };
  }
}

export const tg: TgWebApp | null = (() => {
  if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
    return window.Telegram.WebApp;
  }
  return null;
})();

export const isInTelegram = !!tg && !!tg.initData;

export const initData = tg?.initData || '';
export const tgUser = tg?.initDataUnsafe?.user || null;
export const tgStartParam = tg?.initDataUnsafe?.start_param || null;

export function applyTelegramTheme() {
  if (!tg) return;
  const p = tg.themeParams || {};

  // Маппинг Telegram themeParams → наши CSS-переменные
  const map: Record<string, string | undefined> = {
    '--tg-bg':        p.bg_color,
    '--tg-surface':   p.secondary_bg_color,
    '--tg-surface-2': p.section_bg_color,
    '--tg-text':      p.text_color,
    '--tg-hint':      p.hint_color,
    '--tg-link':      p.link_color,
    '--tg-accent':    p.button_color,
    '--tg-border':    p.section_separator_color,
  };

  const root = document.documentElement;
  for (const [k, v] of Object.entries(map)) {
    if (v) root.style.setProperty(k, v);
  }
  document.documentElement.classList.toggle('dark', tg.colorScheme === 'dark');

  // Разворачиваем во весь экран и красим бары
  try { tg.ready(); } catch {/**/}
  try { tg.expand(); } catch {/**/}
  try { tg.setHeaderColor?.(p.bg_color || '#0f1115'); } catch {/**/}
  try { tg.setBackgroundColor?.(p.bg_color || '#0f1115'); } catch {/**/}
  try { tg.disableVerticalSwipes?.(); } catch {/**/}
}

export function haptic(kind: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'select' = 'light') {
  if (!tg?.HapticFeedback) return;
  try {
    if (kind === 'success' || kind === 'warning' || kind === 'error') {
      tg.HapticFeedback.notificationOccurred(kind);
    } else if (kind === 'select') {
      tg.HapticFeedback.selectionChanged();
    } else {
      tg.HapticFeedback.impactOccurred(kind);
    }
  } catch {/**/}
}

export function openExternal(url: string) {
  if (!url) return;
  if (tg?.openLink) {
    tg.openLink(url, { try_instant_view: false });
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
