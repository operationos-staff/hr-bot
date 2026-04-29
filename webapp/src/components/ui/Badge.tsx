import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

type Variant = 'default' | 'success' | 'warn' | 'danger' | 'muted' | 'accent';

const map: Record<Variant, string> = {
  default: 'bg-tg-surface-2 text-tg-text border-tg-border',
  success: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30',
  warn:    'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30',
  danger:  'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30',
  muted:   'bg-tg-surface-2 text-tg-hint border-tg-border',
  accent:  'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30',
};

export function Badge({
  className,
  variant = 'default',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none whitespace-nowrap',
        map[variant],
        className,
      )}
      {...props}
    />
  );
}
