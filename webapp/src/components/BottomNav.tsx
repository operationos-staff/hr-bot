import { NavLink } from 'react-router-dom';
import { Trophy, BarChart3, Inbox, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { haptic } from '@/lib/telegram';

const tabs = [
  { to: '/',         label: 'Рейтинг',  icon: Trophy },
  { to: '/dashboard', label: 'Дэшборд', icon: BarChart3 },
  { to: '/inbox',     label: 'Отклики', icon: Inbox },
  { to: '/settings',  label: 'Настройки', icon: Settings },
];

export function BottomNav() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-tg-border bg-tg-bg/85 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="mx-auto flex max-w-2xl items-stretch justify-around px-2 py-2">
        {tabs.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => haptic('select')}
            className={({ isActive }) => cn(
              'group flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 px-2 transition-all',
              isActive ? 'text-tg-accent' : 'text-tg-hint',
            )}
          >
            {({ isActive }) => (
              <>
                <span
                  className={cn(
                    'grid h-9 w-9 place-items-center rounded-xl transition-all',
                    isActive ? 'bg-tg-accent/15' : 'bg-transparent',
                  )}
                >
                  <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                </span>
                <span className={cn('text-[10px] font-medium', isActive && 'font-semibold')}>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
