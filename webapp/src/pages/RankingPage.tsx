import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { CandidateCard } from '@/components/CandidateCard';
import { Skeleton } from '@/components/ui/Skeleton';
import { Empty } from '@/components/ui/Empty';
import { Button } from '@/components/ui/Button';
import { RefreshCw, Trophy } from 'lucide-react';
import { useState } from 'react';
import { haptic } from '@/lib/telegram';
import { useVacancy } from '@/lib/useVacancy';

export function RankingPage() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });
  const { selectedVacancyId } = useVacancy();

  const since = settings?.rankingSince;
  const limit = settings?.rankingLimit ?? 50;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ranking', since, limit, selectedVacancyId],
    queryFn: () => api.ranking({ since, limit, vacancyId: selectedVacancyId }),
    enabled: !!settings,
  });

  const [rebuilding, setRebuilding] = useState(false);
  const onRebuild = async () => {
    setRebuilding(true);
    haptic('medium');
    try {
      await api.rebuildRanking();
      await qc.invalidateQueries({ queryKey: ['ranking'] });
      haptic('success');
    } catch {
      haptic('error');
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div className="px-4 pb-6">
      <PageHeader
        title="Рейтинг"
        subtitle={since ? `с ${new Date(since).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
        action={
          <Button size="sm" variant="secondary" onClick={onRebuild} disabled={rebuilding}>
            <RefreshCw size={14} className={rebuilding ? 'animate-spin' : ''} />
            {rebuilding ? 'Обновляю' : 'Обновить'}
          </Button>
        }
      />

      <div className="mt-4 space-y-3">
        {isLoading && Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[120px]" />
        ))}

        {isError && (
          <Empty
            icon={<Trophy size={28} />}
            title="Не удалось загрузить рейтинг"
            hint="Проверь подключение и нажми «Обновить»"
          />
        )}

        {data && data.items.length === 0 && (
          <Empty
            icon={<Trophy size={28} />}
            title="Пока пусто"
            hint="Когда придут отклики и пройдут AI-анализ, они появятся здесь"
          />
        )}

        {data && data.items.map((c, i) => (
          <CandidateCard key={`${c.source}-${c.external_id}`} c={c} rank={i} />
        ))}

        {data && data.items.length > 0 && (
          <p className="pt-2 text-center text-[11px] text-tg-hint">
            {data.count} кандидат{data.count % 10 === 1 && data.count % 100 !== 11 ? '' : data.count % 10 >= 2 && data.count % 10 <= 4 && (data.count % 100 < 10 || data.count % 100 >= 20) ? 'а' : 'ов'} · обновляется автоматически
          </p>
        )}
      </div>
    </div>
  );
}
