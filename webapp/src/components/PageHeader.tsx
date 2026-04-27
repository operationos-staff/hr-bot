import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, action }: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header
      className="sticky top-0 z-20 -mx-4 px-4 pb-3 pt-3 bg-tg-bg/85 backdrop-blur-xl border-b border-tg-border"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight text-tg-text">{title}</h1>
          {subtitle && <p className="mt-0.5 text-xs text-tg-hint">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
