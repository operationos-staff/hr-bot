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
  if (items.length < 2) return null; // одна или ноль — переключатель не нужен

  return (
    <div className="sticky top-0 z-10 bg-tg-bg/90 backdrop-blur px-3 py-2 border-b border-tg-section/40">
      <div className="flex gap-2 overflow-x-auto -mx-3 px-3 no-scrollbar">
        <Tab
          active={selectedVacancyId === null}
          onClick={() => setSelectedVacancyId(null)}
          label="Все"
        />
        {items.map((v) => (
          <Tab
            key={v.id}
            active={selectedVacancyId === v.id}
            onClick={() => setSelectedVacancyId(v.id)}
            label={v.telegram_label || v.title}
          />
        ))}
      </div>
    </div>
  );
}

function Tab({
  active, onClick, label,
}: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'whitespace-nowrap px-3 py-1.5 rounded-full text-sm transition border',
        active
          ? 'bg-tg-button text-tg-button-text border-tg-button'
          : 'bg-tg-section text-tg-text border-transparent hover:bg-tg-section/70'
      )}
    >
      {label}
    </button>
  );
}
