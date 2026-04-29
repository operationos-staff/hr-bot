import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { CandidateCard } from '@/components/CandidateCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { Empty } from '@/components/ui/Empty';
import { Inbox, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Source, Status } from '@/lib/types';
import { haptic } from '@/lib/telegram';
import { useVacancy } from '@/lib/useVacancy';

const STATUS_TABS: { value: Status; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'qualified', label: '✅ Подходят' },
  { value: 'maybe', label: '🟡 Проверить' },
  { value: 'rejected', label: '❌ Откланены' },
];

const SOURCE_TABS: { value: Source | 'all'; label: string }[] = [
  { value: 'all', label: 'Все источники' },
  { value: 'habr', label: 'Хабр' },
  { value: 'hh',   label: 'HH' },
];

export function ApplicationsPage() {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });
  const { selectedVacancyId } = useVacancy();
  const [status, setStatus] = useState<Status>('all');
  const [source, setSource] = useState<Source | 'all'>('all');
  const [search, setSearch] = useState('');
  const [needsClarification, setNeedsClarification] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Применяем дефолты из настроек один раз
  useEffect(() => {
    if (settings) {
      setStatus(settings.defaultStatus);
      setSource(settings.defaultSource);
    }
  }, [settings]);

  // Debounce для поиска
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(() => ({
    status, source, search: debouncedSearch,
    needsClarification: needsClarification || undefined,
    vacancyId: selectedVacancyId,
    limit: 50, offset: 0,
  }), [status, source, debouncedSearch, needsClarification, selectedVacancyId]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['applications', params],
    queryFn: () => api.applications(params),
    placeholderData: prev => prev,
  });

  return (
    <div className="px-4 pb-6">
      <PageHeader
        title="Все отклики"
        subtitle={data ? `${data.total} всего` : undefined}
      />

      {/* Поиск */}
      <div className="mt-3 relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-tg-hint" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени, должности, вакансии"
          className="w-full rounded-xl border border-tg-border bg-tg-surface-2 py-2.5 pl-9 pr-9 text-sm text-tg-text placeholder:text-tg-hint focus:outline-none focus:ring-2 focus:ring-tg-accent/40"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 grid h-7 w-7 place-items-center rounded-lg text-tg-hint hover:bg-tg-surface"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Status pills */}
      <div className="mt-3 flex gap-2 overflow-x-auto no-scrollbar">
        {STATUS_TABS.map(t => (
          <button
            key={t.value}
            onClick={() => { setStatus(t.value); haptic('select'); }}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
              status === t.value
                ? 'border-tg-accent bg-tg-accent/15 text-tg-accent'
                : 'border-tg-border bg-tg-surface-2 text-tg-hint',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Source + clarif */}
      <div className="mt-2 flex gap-2 overflow-x-auto no-scrollbar">
        {SOURCE_TABS.map(t => (
          <button
            key={t.value}
            onClick={() => { setSource(t.value); haptic('select'); }}
            className={cn(
              'shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition-all',
              source === t.value
                ? 'border-tg-accent/60 bg-tg-accent/10 text-tg-accent'
                : 'border-tg-border bg-tg-surface-2 text-tg-hint',
            )}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => { setNeedsClarification(v => !v); haptic('select'); }}
          className={cn(
            'shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium transition-all',
            needsClarification
              ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
              : 'border-tg-border bg-tg-surface-2 text-tg-hint',
          )}
        >
          ❗ Требуют уточнения
        </button>
      </div>

      {/* Список */}
      <div className="mt-4 space-y-3">
        {isLoading && Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px]" />
        ))}

        {isError && (
          <Empty icon={<Inbox size={28} />} title="Не удалось загрузить отклики" />
        )}

        {data && data.items.length === 0 && (
          <Empty
            icon={<Inbox size={28} />}
            title="Ничего не найдено"
            hint="Попробуй сбросить фильтры или поиск"
          />
        )}

        {data && data.items.map(c => (
          <CandidateCard key={`${c.source}-${c.external_id}`} c={c} />
        ))}

        {data && data.items.length > 0 && data.items.length < data.total && (
          <p className="pt-2 text-center text-[11px] text-tg-hint">
            Показано {data.items.length} из {data.total}
          </p>
        )}
      </div>
    </div>
  );
}
