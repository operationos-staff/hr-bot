import { cn } from '@/lib/utils';

/**
 * Круглый индикатор AI score 0..10. Премиальный, с градиентом.
 */
export function ScoreRing({
  score,
  size = 56,
  className,
}: { score: number | null | undefined; size?: number; className?: string }) {
  const value = typeof score === 'number' ? Math.max(0, Math.min(10, score)) : null;
  const pct = value === null ? 0 : (value / 10) * 100;

  // Цвет градиента
  let from = '#6b7280', to = '#9ca3af'; // grey
  if (value !== null) {
    if (value >= 9) { from = '#fbbf24'; to = '#f59e0b'; }   // gold
    else if (value >= 7) { from = '#10b981'; to = '#059669'; } // emerald
    else if (value >= 5) { from = '#eab308'; to = '#ca8a04'; } // yellow
    else { from = '#f43f5e'; to = '#e11d48'; } // rose
  }

  const stroke = 5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const id = `g-${from.slice(1)}-${to.slice(1)}`;

  return (
    <div className={cn('relative inline-grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={from} />
            <stop offset="100%" stopColor={to} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="transparent"
                stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="transparent"
                stroke={`url(#${id})`} strokeWidth={stroke}
                strokeDasharray={`${dash} ${c}`}
                strokeLinecap="round"
                style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="text-sm font-bold text-tg-text leading-none" style={{ fontVariantNumeric: 'tabular-nums' }}>
          {value === null ? '—' : value.toFixed(value % 1 === 0 ? 0 : 1)}
        </span>
      </div>
    </div>
  );
}
