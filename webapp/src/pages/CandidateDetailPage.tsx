import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardSub, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Empty } from '@/components/ui/Empty';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ScoreRing } from '@/components/ui/ScoreRing';
import {
  ArrowLeft, ExternalLink, MapPin, Briefcase, Clock, MessageSquare, AlertTriangle,
  Sparkles, FileText, CheckCircle2, AlertCircle, XCircle, Link2,
} from 'lucide-react';
import { formatDate, formatRelative, sourceLabel, statusLabel, scoreColor } from '@/lib/utils';
import { openExternal, haptic } from '@/lib/telegram';

export function CandidateDetailPage() {
  const { source = '', externalId = '' } = useParams();
  const nav = useNavigate();

  const { data: c, isLoading, isError } = useQuery({
    queryKey: ['candidate', source, externalId],
    queryFn: () => api.candidate(source, externalId),
    enabled: !!source && !!externalId,
  });

  if (isLoading) {
    return (
      <div className="px-4 py-3 space-y-3">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-32" />
        <Skeleton className="h-40" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (isError || !c) {
    return <Empty icon={<XCircle size={28} />} title="Не удалось загрузить" hint="Кандидат не найден или ошибка сети" />;
  }

  const StatusIcon = c.qualified === true ? CheckCircle2 : c.qualified === null ? AlertCircle : XCircle;
  const statusVar = c.qualified === true ? 'success' : c.qualified === null ? 'warn' : 'danger';

  return (
    <div className="px-4 pb-6">
      {/* Top bar c BackButton fallback */}
      <div className="sticky top-0 z-20 -mx-4 flex items-center gap-2 bg-tg-bg/85 px-4 py-3 backdrop-blur-xl"
           style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}>
        <button onClick={() => { haptic('light'); nav(-1); }}
                className="grid h-9 w-9 place-items-center rounded-xl text-tg-text hover:bg-tg-surface-2">
          <ArrowLeft size={18} />
        </button>
        <p className="text-sm font-medium text-tg-hint">{sourceLabel(c.source)}</p>
      </div>

      {/* Hero */}
      <Card className="mt-3 overflow-hidden">
        <div className="flex items-start gap-4">
          <Avatar name={c.candidate_name} size={64} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold text-tg-text">{c.candidate_name || 'Без имени'}</h2>
            <p className="mt-0.5 line-clamp-2 text-sm text-tg-hint">{c.position || '—'}</p>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant={statusVar as any}>
                <StatusIcon size={12} /> {statusLabel(c.qualified)}
              </Badge>
              {c.ai_needs_clarification && <Badge variant="warn">❗ уточнить</Badge>}
              <Badge variant={c.citizenship === 'RU' ? 'accent' : 'muted'}>
                {c.citizenship === 'RU' ? '🇷🇺 РФ' : c.citizenship_raw || c.citizenship || '🌍 ?'}
              </Badge>
              <Badge variant="muted">{c.experience_years !== null ? `${c.experience_years} лет` : 'опыт ?'}</Badge>
            </div>
          </div>
          <ScoreRing score={c.ai_score} size={72} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-tg-border pt-3 text-xs text-tg-hint">
          <Info icon={<Briefcase size={12} />} label="Вакансия" value={c.vacancy_title} />
          <Info icon={<MapPin size={12} />} label="Локация" value={c.location} />
          <Info icon={<Clock size={12} />} label="Получено" value={c.received_at ? formatRelative(c.received_at) : null} />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {c.candidate_url && (
            <Button size="sm" onClick={() => openExternal(c.candidate_url!)}>
              <ExternalLink size={14} /> Резюме на {c.source === 'habr' ? 'Хабре' : 'HH'}
            </Button>
          )}
          {c.application_url && c.application_url !== c.candidate_url && (
            <Button size="sm" variant="secondary" onClick={() => openExternal(c.application_url!)}>
              <Link2 size={14} /> Отклик
            </Button>
          )}
        </div>
      </Card>

      {/* AI разбор */}
      {(c.ai_score !== null || c.ai_summary) && (
        <Card className="mt-3 border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-transparent">
          <div className="mb-2 flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Sparkles size={16} className="text-violet-300" /> AI-оценка тим-лида
            </CardTitle>
            {c.ai_analyzed_at && <CardSub>{formatDate(c.ai_analyzed_at)}</CardSub>}
          </div>

          {c.ai_score !== null && (
            <div className="mb-3 flex items-center gap-3">
              <span className={`text-3xl font-extrabold leading-none ${scoreColor(c.ai_score)}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                {c.ai_score}<span className="text-lg text-tg-hint">/10</span>
              </span>
              {c.ai_verdict && <Badge variant="accent">{c.ai_verdict}</Badge>}
            </div>
          )}

          {c.ai_needs_clarification && c.ai_clarification && (
            <div className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <AlertTriangle size={12} /> Уточнить у кандидата
              </p>
              <p className="text-sm text-amber-100/90">{c.ai_clarification}</p>
            </div>
          )}

          {c.ai_summary && (
            <p className="text-sm leading-relaxed text-tg-text/90">{c.ai_summary}</p>
          )}
        </Card>
      )}

      {/* Сопроводительное */}
      {c.cover_letter && (
        <Card className="mt-3">
          <CardTitle className="mb-2 flex items-center gap-2">
            <MessageSquare size={16} /> Сопроводительное письмо
          </CardTitle>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-tg-text/90">{c.cover_letter}</p>
        </Card>
      )}

      {/* Filter reason / debug */}
      {c.filter_reason && (
        <Card className="mt-3">
          <CardTitle className="mb-1 flex items-center gap-2">
            <FileText size={16} /> Причина пометки
          </CardTitle>
          <p className="text-sm text-tg-hint">{c.filter_reason}</p>
        </Card>
      )}
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-tg-hint">
        {icon} {label}
      </p>
      <p className="mt-1 truncate text-xs font-medium text-tg-text">{value || '—'}</p>
    </div>
  );
}
