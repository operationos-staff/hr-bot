import { Link } from 'react-router-dom';
import { Card } from './ui/Card';
import { Badge } from './ui/Badge';
import { Avatar } from './ui/Avatar';
import { ScoreRing } from './ui/ScoreRing';
import { ChevronRight, MapPin, Briefcase, Clock, Check } from 'lucide-react';
import type { CandidateBase } from '@/lib/types';
import { formatRelative, sourceLabel, statusEmoji, statusLabel, truncate } from '@/lib/utils';
import { haptic } from '@/lib/telegram';

export function CandidateCard({ c, rank }: { c: CandidateBase; rank?: number }) {
  const expText = c.experience_years !== null && c.experience_years !== undefined
    ? `${c.experience_years} лет`
    : 'опыт не указан';

  const auraClass =
    rank === 0 ? 'aura-gold'
    : rank === 1 ? 'aura-silver'
    : rank === 2 ? 'aura-bronze'
    : '';

  // F5: визуальная метка обработанных — карточка приглушена, иконка ✓
  const processed = !!c.processed_at;
  const processedClass = processed ? 'opacity-60 hover:opacity-90 transition-opacity' : '';

  return (
    <Link
      to={`/candidate/${encodeURIComponent(c.source)}/${encodeURIComponent(c.external_id)}`}
      onClick={() => haptic('light')}
      className={`block animate-in ${processedClass}`}
    >
      <Card className={`relative overflow-hidden ${auraClass}`}>
        {typeof rank === 'number' && rank < 3 && (
          <div className="absolute right-3 top-3 text-xl">
            {rank === 0 ? '🥇' : rank === 1 ? '🥈' : '🥉'}
          </div>
        )}
        {processed && (
          <div
            className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white shadow-md shadow-emerald-500/40"
            title={`Обработан${c.processed_by ? ` @${c.processed_by}` : ''}`}
          >
            <Check size={14} strokeWidth={3} />
          </div>
        )}

        <div className="flex items-start gap-3">
          <Avatar name={c.candidate_name} size={48} className="shrink-0" />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-base font-semibold text-tg-text">
                {c.candidate_name || 'Без имени'}
              </h3>
              {c.ai_needs_clarification && (
                <Badge variant="warn" className="shrink-0">❗ уточнить</Badge>
              )}
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tg-hint">
              <span className="inline-flex items-center gap-1">
                <Briefcase size={12} />
                {truncate(c.position, 36) || '—'}
              </span>
              {c.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} />
                  {truncate(c.location, 22)}
                </span>
              )}
              {c.received_at && (
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} />
                  {formatRelative(c.received_at)}
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant={c.qualified === true ? 'success' : c.qualified === null ? 'warn' : 'danger'}>
                {statusEmoji(c.qualified)} {statusLabel(c.qualified)}
              </Badge>
              <Badge variant="muted">{sourceLabel(c.source)}</Badge>
              <Badge variant={c.citizenship === 'RU' ? 'accent' : 'muted'}>
                {c.citizenship === 'RU' ? '🇷🇺 РФ' : c.citizenship_raw || c.citizenship || '🌍 ?'}
              </Badge>
              <Badge variant="muted">{expText}</Badge>
            </div>

            {c.ai_verdict && (
              <p className="mt-2 line-clamp-1 text-xs text-tg-hint">
                <span className="text-tg-text/80">AI:</span> {c.ai_verdict}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col items-center gap-1.5 pt-0.5">
            <ScoreRing score={c.ai_score} size={52} />
            <ChevronRight size={16} className="text-tg-hint" />
          </div>
        </div>
      </Card>
    </Link>
  );
}
