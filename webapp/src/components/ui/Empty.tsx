import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export function Empty({ icon, title, hint, className }: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn('mx-auto flex max-w-xs flex-col items-center text-center py-16', className)}>
      <div className="mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-tg-surface-2 text-tg-hint">
        {icon}
      </div>
      <p className="text-base font-semibold text-tg-text">{title}</p>
      {hint && <p className="mt-1 text-sm text-tg-hint">{hint}</p>}
    </div>
  );
}
