import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardSub, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { Save, RefreshCw, Settings as SettingsIcon, Calendar, Hash, Briefcase, ChevronRight } from 'lucide-react';
import type { AppSettings, Source, Status } from '@/lib/types';
import { tg, tgUser, haptic } from '@/lib/telegram';

export function SettingsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: server, isLoading } = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });

  const [form, setForm] = useState<AppSettings | null>(null);

  useEffect(() => { if (server) setForm(server); }, [server]);

  const m = useMutation({
    mutationFn: (patch: Partial<AppSettings>) => api.settings.update(patch),
    onSuccess: (data) => {
      qc.setQueryData(['settings'], data);
      qc.invalidateQueries({ queryKey: ['ranking'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      haptic('success');
    },
    onError: () => haptic('error'),
  });

  const rebuildM = useMutation({
    mutationFn: () => api.rebuildRanking(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ranking'] }); haptic('success'); },
    onError: () => haptic('error'),
  });

  if (isLoading || !form) {
    return (
      <div className="px-4 py-3 space-y-3">
        <Skeleton className="h-10" />
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  // дата для <input type="date">: yyyy-mm-dd
  const dateValue = form.rankingSince.slice(0, 10);
  const update = (patch: Partial<AppSettings>) => setForm(f => f ? { ...f, ...patch } : f);

  const dirty = JSON.stringify(form) !== JSON.stringify(server);

  return (
    <div className="px-4 pb-6">
      <PageHeader
        title="Настройки"
        subtitle="Период, фильтры по умолчанию, действия"
      />

      {/* User */}
      <Card className="mt-4 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-tg-accent/15 text-tg-accent">
          <SettingsIcon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{tgUser?.first_name || 'Пользователь'} {tgUser?.last_name || ''}</p>
          <p className="text-xs text-tg-hint">@{tgUser?.username || '—'} · id {tgUser?.id || '—'}</p>
        </div>
      </Card>

      {/* Управление вакансиями */}
      <Card className="mt-3">
        <button
          onClick={() => { haptic('light'); nav('/vacancies'); }}
          className="-m-4 flex w-[calc(100%+2rem)] items-center gap-3 p-4 text-left hover:bg-tg-surface-2/50 transition rounded-2xl"
        >
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-tg-accent/15 text-tg-accent">
            <Briefcase size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-tg-text">Управление вакансиями</p>
            <p className="text-xs text-tg-hint">Добавить новую, включить/выключить мониторинг</p>
          </div>
          <ChevronRight size={18} className="text-tg-hint" />
        </button>
      </Card>

      {/* Период рейтинга */}
      <Card className="mt-3">
        <CardTitle>Период рейтинга</CardTitle>
        <CardSub className="mb-3">Учитываются кандидаты, полученные с этой даты</CardSub>
        <Field label="С даты" icon={<Calendar size={14} />}>
          <input
            type="date"
            value={dateValue}
            onChange={(e) => update({ rankingSince: e.target.value ? new Date(e.target.value).toISOString() : form.rankingSince })}
            className="rounded-lg border border-tg-border bg-tg-surface-2 px-3 py-1.5 text-sm text-tg-text focus:outline-none focus:ring-2 focus:ring-tg-accent/40"
          />
        </Field>
        <Field label="Лимит листа Sheets" icon={<Hash size={14} />}>
          <NumberInput value={form.rankingLimit} min={1} max={500}
                       onChange={(v) => update({ rankingLimit: v })} />
        </Field>
        <Field label="Топ N в Telegram pinned" icon={<Hash size={14} />}>
          <NumberInput value={form.rankingTelegramTop} min={1} max={50}
                       onChange={(v) => update({ rankingTelegramTop: v })} />
        </Field>
      </Card>

      {/* Дефолты «Все отклики» */}
      <Card className="mt-3">
        <CardTitle>Фильтры по умолчанию</CardTitle>
        <CardSub className="mb-3">Применяются на вкладке «Отклики»</CardSub>

        <Field label="Статус">
          <Pills<Status>
            current={form.defaultStatus}
            onChange={(v) => update({ defaultStatus: v })}
            items={[
              { value: 'all', label: 'Все' },
              { value: 'qualified', label: '✅' },
              { value: 'maybe', label: '🟡' },
              { value: 'rejected', label: '❌' },
            ]}
          />
        </Field>
        <Field label="Источник">
          <Pills<Source | 'all'>
            current={form.defaultSource}
            onChange={(v) => update({ defaultSource: v })}
            items={[
              { value: 'all', label: 'Все' },
              { value: 'habr', label: 'Хабр' },
              { value: 'hh',   label: 'HH' },
            ]}
          />
        </Field>
        <Field label="Минимальный AI score">
          <NumberInput value={form.defaultMinScore} min={0} max={10}
                       onChange={(v) => update({ defaultMinScore: v })} />
        </Field>
      </Card>

      {/* Действия */}
      <Card className="mt-3">
        <CardTitle>Действия</CardTitle>
        <CardSub className="mb-3">Принудительно обновить рейтинг в Sheets и закреплённое сообщение в Telegram</CardSub>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => rebuildM.mutate()} disabled={rebuildM.isPending}>
            <RefreshCw size={14} className={rebuildM.isPending ? 'animate-spin' : ''} />
            Пересчитать рейтинг
          </Button>
          {tg && (
            <Button variant="secondary" onClick={() => tg!.close()}>
              Закрыть Mini App
            </Button>
          )}
        </div>
      </Card>

      {/* Save */}
      <div className="sticky bottom-[calc(80px+env(safe-area-inset-bottom))] mt-4 flex justify-end">
        <Button
          size="lg"
          onClick={() => m.mutate(form)}
          disabled={!dirty || m.isPending}
          className="shadow-glow"
        >
          <Save size={16} />
          {m.isPending ? 'Сохраняю…' : dirty ? 'Сохранить' : 'Сохранено'}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-3 last:mb-0 flex items-center justify-between gap-3">
      <p className="flex items-center gap-1.5 text-xs text-tg-hint">{icon} {label}</p>
      <div>{children}</div>
    </div>
  );
}

function NumberInput({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(e) => onChange(Math.max(min, Math.min(max, parseInt(e.target.value || '0', 10) || 0)))}
      className="w-20 rounded-lg border border-tg-border bg-tg-surface-2 px-3 py-1.5 text-right text-sm text-tg-text focus:outline-none focus:ring-2 focus:ring-tg-accent/40"
    />
  );
}

function Pills<T extends string>({ current, onChange, items }: {
  current: T; onChange: (v: T) => void;
  items: { value: T; label: string }[];
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-tg-surface-2 p-0.5">
      {items.map((i) => (
        <button
          key={i.value}
          onClick={() => { onChange(i.value); haptic('select'); }}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
            current === i.value ? 'bg-tg-bg text-tg-text shadow' : 'text-tg-hint hover:text-tg-text'
          }`}
        >
          {i.label}
        </button>
      ))}
    </div>
  );
}
