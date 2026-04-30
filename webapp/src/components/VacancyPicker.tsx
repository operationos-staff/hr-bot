/**
 * VacancyPicker (D5) — горизонтальные tabs «Все | <вакансия 1> | <вакансия 2>».
 * Один Telegram-канал, в Mini App же разводим по вкладкам.
 *
 * Берёт список из /api/vacancies, состояние — из useVacancy().
 * Прячется, если вакансия одна или ни одной (нет смысла переключать).
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useVacancy } from '@/lib/useVacancy';
import { haptic } from '@/lib/telegram';
import { LayoutGrid } from 'lucide-react';
import clsx from 'clsx';

export function VacancyPicker() {
  const { selectedVacancyId, setSelectedVacancyId } = useVacancy();
  const { data, isLoading } = useQuery({
    queryKey: ['vacancies'],
    queryFn: () => api.vacancies(true),
    staleTime: 5 * 60_000,
  });

  if (isLoading) return null;
  const items = data?.items || [];
  if (items.length < 2) return null;

  const select = (id: string | null) => {
    haptic('select');
    setSelectedVacancyId(id);
  };

  return (
    <div className="sticky top-0 z-10 bg-tg-bg/85 backdrop-blur-xl px-3 py-2.5 border-b border-tg-border/60">
      <div className="flex gap-2 overflow-x-auto -mx-3 px-3 no-scrollbar">
        <Tab
          active={selectedVacancyId === null}
          onClick={() => select(null)}
          label="Все"
          icon={<LayoutGrid size={13} />}
        />
        {items.map((v) => (
          <Tab
            key={v.id}
            active={selectedVacancyId === v.id}
            onClick={() => select(v.id)}
            label={v.telegram_label || v.title}
          />
        ))}
      </div>
    </div>
  );
}

function Tab({
  active, onClick, label, icon,
}: { active: boolean; onClick: () => void; label: string; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        'group relative inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium',
        'transition-all duration-200 ease-out border active:scale-[0.96]',
        active
          ? [
              // Light theme: bright accent with soft shadow
              'bg-tg-accent text-white border-tg-accent shadow-md shadow-tg-accent/30 font-semibold',
              // Dark theme: same accent, slightly different shadow
              'dark:shadow-tg-accent/40',
            ].join(' ')
          : [
              // Light theme: clean surface with subtle border, hover lifts the border
              'bg-tg-surface text-tg-text border-tg-border',
              'hover:border-tg-accent/40 hover:bg-tg-surface-2',
              // Dark theme: same approach (CSS-vars сами адаптируются)
            ].join(' ')
      )}
    >
      {/* Точка-индикатор у активного таба слева, пульсирует приглушённо */}
      {active && !icon && (
        <span className="block h-1.5 w-1.5 rounded-full bg-white/90 shadow-[0_0_6px_rgba(255,255,255,0.7)]" aria-hidden />
      )}
      {icon && (
        <span className={clsx('shrink-0', active ? 'text-white' : 'text-tg-hint')}>
          {icon}
        </span>
      )}
      <span>{label}</span>
    </button>
  );
}
