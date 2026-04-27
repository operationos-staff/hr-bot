import clsx, { type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('ru-RU', { ...opts, timeZone: 'Europe/Moscow' });
  } catch { return ''; }
}

export function formatDateOnly(iso: string | null | undefined): string {
  return formatDate(iso, { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return '';
  const diff = Date.now() - d;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} дн назад`;
  return formatDateOnly(iso);
}

export function truncate(s: string | null | undefined, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function scoreColor(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'text-tg-hint';
  if (score >= 9) return 'text-amber-400';
  if (score >= 7) return 'text-emerald-400';
  if (score >= 5) return 'text-yellow-400';
  return 'text-rose-400';
}

export function scoreBg(score: number | null | undefined): string {
  if (score === null || score === undefined) return 'bg-tg-surface-2 text-tg-hint border-tg-border';
  if (score >= 9) return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  if (score >= 7) return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  if (score >= 5) return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30';
  return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
}

export function statusEmoji(qualified: boolean | null): string {
  if (qualified === true) return '✅';
  if (qualified === null) return '🟡';
  return '❌';
}

export function statusLabel(qualified: boolean | null): string {
  if (qualified === true) return 'Подходит';
  if (qualified === null) return 'Проверить';
  return 'Не подходит';
}

export function sourceLabel(source: string): string {
  if (source === 'habr') return 'Хабр Карьера';
  if (source === 'hh') return 'HeadHunter';
  return source;
}

export function rankBadge(idx: number): string {
  if (idx === 0) return '🥇';
  if (idx === 1) return '🥈';
  if (idx === 2) return '🥉';
  return `${idx + 1}`;
}
