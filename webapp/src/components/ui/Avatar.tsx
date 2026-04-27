import { cn } from '@/lib/utils';

/** Простой аватар с инициалами и градиентом, генерируемым из имени. */
export function Avatar({ name, size = 44, className }: { name: string | null | undefined; size?: number; className?: string }) {
  const initials = (name || '?')
    .split(/\s+/)
    .map(s => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const hue = (() => {
    const s = name || '?';
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return h;
  })();

  const bg = `linear-gradient(135deg, hsl(${hue}, 70%, 55%), hsl(${(hue + 40) % 360}, 70%, 45%))`;

  return (
    <div
      className={cn('grid place-items-center rounded-full font-bold text-white', className)}
      style={{ width: size, height: size, background: bg, fontSize: size * 0.36 }}
    >
      {initials || '?'}
    </div>
  );
}
