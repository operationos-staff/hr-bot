/**
 * VacanciesPage — управление вакансиями в Mini App (E5).
 *
 * - Список активных и архивных вакансий
 * - Toggle is_active одной кнопкой
 * - Форма «Добавить вакансию»: source / external_id / title / telegram_label /
 *   description / ai_prompt
 *
 * Доступна по /vacancies, ссылка из SettingsPage.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Empty } from '@/components/ui/Empty';
import { Plus, ArrowLeft, Briefcase, Power, PowerOff, Save } from 'lucide-react';
import { haptic } from '@/lib/telegram';
import type { Vacancy } from '@/lib/types';

export function VacanciesPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['vacancies', 'all'],
    queryFn: () => api.vacancies.list(false), // включая is_active=false
  });

  const togglePatch = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      api.vacancies.patch(id, { is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vacancies'] });
      haptic('success');
    },
    onError: () => haptic('error'),
  });

  const items = data?.items || [];

  return (
    <div className="px-4 pb-6">
      <div className="sticky top-0 z-20 -mx-4 flex items-center gap-2 bg-tg-bg/85 px-4 py-3 backdrop-blur-xl">
        <button onClick={() => { haptic('light'); nav(-1); }}
                className="grid h-9 w-9 place-items-center rounded-xl text-tg-text hover:bg-tg-surface-2">
          <ArrowLeft size={18} />
        </button>
        <p className="text-sm font-medium text-tg-hint">Назад</p>
      </div>

      <PageHeader
        title="Вакансии"
        subtitle={items.length ? `${items.length} в БД` : undefined}
        action={
          <Button size="sm" variant={showForm ? 'secondary' : 'primary'} onClick={() => setShowForm(v => !v)}>
            <Plus size={14} /> {showForm ? 'Закрыть' : 'Добавить'}
          </Button>
        }
      />

      {showForm && <AddVacancyForm onSaved={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['vacancies'] }); }} />}

      <div className="mt-4 space-y-3">
        {isLoading && Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}

        {data && items.length === 0 && (
          <Empty
            icon={<Briefcase size={28} />}
            title="Вакансий пока нет"
            hint="Нажми «Добавить» — создай первую"
          />
        )}

        {items.map((v) => (
          <VacancyRow
            key={v.id}
            v={v}
            onToggle={() => togglePatch.mutate({ id: v.id, is_active: !v.is_active })}
            isPending={togglePatch.isPending && togglePatch.variables?.id === v.id}
          />
        ))}
      </div>
    </div>
  );
}

function VacancyRow({ v, onToggle, isPending }: { v: Vacancy; onToggle: () => void; isPending: boolean }) {
  return (
    <Card className="flex items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={v.source === 'habr' ? 'accent' : 'default'}>
            {v.source === 'habr' ? 'Хабр' : 'HH'}
          </Badge>
          {v.telegram_label && <Badge variant="muted">{v.telegram_label}</Badge>}
          <Badge variant={v.is_active ? 'success' : 'muted'}>
            {v.is_active ? 'активна' : 'выключена'}
          </Badge>
        </div>
        <p className="mt-1.5 truncate text-sm font-medium text-tg-text">{v.title}</p>
        <p className="mt-0.5 truncate text-xs text-tg-hint">id: {v.external_id}</p>
      </div>
      <Button
        size="sm"
        variant={v.is_active ? 'danger' : 'primary'}
        onClick={onToggle}
        disabled={isPending}
      >
        {v.is_active ? <PowerOff size={14} /> : <Power size={14} />}
        {v.is_active ? 'Выкл' : 'Вкл'}
      </Button>
    </Card>
  );
}

function AddVacancyForm({ onSaved }: { onSaved: () => void }) {
  const [source, setSource] = useState<'habr' | 'hh'>('hh');
  const [externalId, setExternalId] = useState('');
  const [title, setTitle] = useState('');
  const [telegramLabel, setTelegramLabel] = useState('');
  const [description, setDescription] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    setErr(null);
    setSubmitting(true);
    try {
      await api.vacancies.create({
        source,
        external_id: externalId.trim(),
        title: title.trim(),
        telegram_label: telegramLabel.trim() || undefined,
        description: description.trim() || undefined,
        ai_prompt: aiPrompt.trim() || undefined,
        is_active: true,
      });
      haptic('success');
      onSaved();
    } catch (e: any) {
      setErr(e?.detail || e?.message || 'Ошибка сохранения');
      haptic('error');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit = !submitting && externalId.trim() && title.trim();

  return (
    <Card className="mt-3 space-y-3">
      <div className="flex gap-2">
        {(['habr', 'hh'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
              source === s
                ? 'bg-tg-button text-tg-button-text border-tg-button'
                : 'bg-tg-section text-tg-text border-tg-border'
            }`}
          >
            {s === 'habr' ? 'Хабр Карьера' : 'HeadHunter'}
          </button>
        ))}
      </div>

      <Field label="External ID (из URL вакансии)" value={externalId} onChange={setExternalId} placeholder="132556253" />
      <Field label="Название" value={title} onChange={setTitle} placeholder="Технический специалист amoCRM" />
      <Field label="Telegram-label (короткий тег)" value={telegramLabel} onChange={setTelegramLabel} placeholder="amoCRM" />

      <TextareaField
        label="Описание вакансии (для людей и AI-контекста)"
        value={description}
        onChange={setDescription}
        rows={6}
        placeholder="Полный текст вакансии..."
      />
      <TextareaField
        label="AI-промпт (системные инструкции для оценщика)"
        value={aiPrompt}
        onChange={setAiPrompt}
        rows={6}
        placeholder="Ты — старший CRM-эксперт..."
      />

      {err && <p className="text-xs text-rose-700 dark:text-rose-300">{err}</p>}

      <Button onClick={submit} disabled={!canSubmit}>
        <Save size={14} /> {submitting ? 'Сохраняю...' : 'Сохранить'}
      </Button>
    </Card>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wider text-tg-hint">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-tg-border bg-tg-surface-2 px-3 py-2 text-sm text-tg-text placeholder:text-tg-hint focus:outline-none focus:ring-2 focus:ring-tg-accent/40"
      />
    </div>
  );
}

function TextareaField({ label, value, onChange, rows = 4, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] uppercase tracking-wider text-tg-hint">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-lg border border-tg-border bg-tg-surface-2 px-3 py-2 text-sm text-tg-text placeholder:text-tg-hint focus:outline-none focus:ring-2 focus:ring-tg-accent/40"
      />
    </div>
  );
}
