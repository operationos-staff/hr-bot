import { cn } from '@/lib/utils';
import { forwardRef, ButtonHTMLAttributes } from 'react';
import { haptic } from '@/lib/telegram';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-tg-accent text-white hover:opacity-90',
  secondary: 'bg-tg-surface-2 text-tg-text border border-tg-border hover:bg-tg-surface',
  ghost: 'text-tg-text hover:bg-tg-surface-2',
  danger: 'bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30 dark:hover:bg-rose-500/25',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-5 text-base',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  hapticKind?: Parameters<typeof haptic>[0];
}>(
  ({ className, variant = 'primary', size = 'md', onClick, hapticKind = 'light', ...props }, ref) => (
    <button
      ref={ref}
      onClick={(e) => { haptic(hapticKind); onClick?.(e); }}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';
