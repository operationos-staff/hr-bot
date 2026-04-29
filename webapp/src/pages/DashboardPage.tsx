import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardSub, CardTitle } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Empty } from '@/components/ui/Empty';
import { BarChart3, CheckCircle2, AlertCircle, Sparkles, XCircle, Bot } from 'lucide-react';
import {
  Area, AreaChart, BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';

const COLORS = ['#10b981', '#eab308', '#f43f5e'];

export function DashboardPage() {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.settings.get });
  const since = settings?.rankingSince;

  const { data, isLoading } = useQuery({
    queryKey: ['stats', since],
    queryFn: () => api.stats(since),
    enabled: !!settings,
  });

  return (
    <div className="px-4 pb-6">
      <PageHeader
        title="Дэшборд"
        subtitle={since ? `с ${new Date(since).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
      />

      {isLoading && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
          </div>
          <Skeleton className="h-40" />
          <Skeleton className="h-48" />
        </div>
      )}

      {!isLoading && data && data.kpi.total === 0 && (
        <Empty icon={<BarChart3 size={28} />} title="Нет данных за выбранный период" hint="Проверь настройки периода рейтинга" />
      )}

      {!isLoading && data && data.kpi.total > 0 && (
        <div className="mt-4 space-y-4">
          {/* KPI */}
          <div className="grid grid-cols-3 gap-3">
            <KpiTile label="Всего" value={data.kpi.total} icon={<Bot size={16} />} />
            <KpiTile label="Подходят" value={data.kpi.qualified} icon={<CheckCircle2 size={16} />} accent="emerald" />
            <KpiTile label="🟡 Проверить" value={data.kpi.maybe} icon={<AlertCircle size={16} />} accent="amber" />
            <KpiTile label="Отклонены" value={data.kpi.rejected} icon={<XCircle size={16} />} accent="rose" />
            <KpiTile label="AI оценка" value={data.kpi.avgScore.toFixed(1)} suffix="/10" icon={<Sparkles size={16} />} accent="violet" />
            <KpiTile label="❗ Уточнить" value={data.kpi.needsClarification} accent="amber" />
          </div>

          {/* Динамика по дням */}
          <Card>
            <CardTitle>Динамика откликов</CardTitle>
            <CardSub className="mb-2">по дням, период из настроек</CardSub>
            <div className="h-44 -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.timeline}>
                  <defs>
                    <linearGradient id="gQ" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.6} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gM" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#eab308" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#eab308" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fill: 'var(--tg-hint)', fontSize: 10 }} stroke="transparent" />
                  <YAxis allowDecimals={false} tick={{ fill: 'var(--tg-hint)', fontSize: 10 }} stroke="transparent" />
                  <Tooltip
                    contentStyle={{ background: 'var(--tg-surface)', border: '1px solid var(--tg-border)', borderRadius: 12, fontSize: 12 }}
                    labelStyle={{ color: 'var(--tg-hint)' }}
                  />
                  <Area type="monotone" dataKey="qualified" stroke="#10b981" fill="url(#gQ)" strokeWidth={2} />
                  <Area type="monotone" dataKey="maybe" stroke="#eab308" fill="url(#gM)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* Score distribution + by source */}
          <div className="grid grid-cols-1 gap-3">
            <Card>
              <CardTitle>Распределение оценок AI</CardTitle>
              <CardSub className="mb-2">{data.kpi.aiAnalyzed} проанализировано</CardSub>
              <div className="h-40 -mx-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.scoreDistribution}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="range" tick={{ fill: 'var(--tg-hint)', fontSize: 10 }} stroke="transparent" />
                    <YAxis allowDecimals={false} tick={{ fill: 'var(--tg-hint)', fontSize: 10 }} stroke="transparent" />
                    <Tooltip
                      contentStyle={{ background: 'var(--tg-surface)', border: '1px solid var(--tg-border)', borderRadius: 12, fontSize: 12 }}
                    />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                      {data.scoreDistribution.map((d: { range: string; count: number }) => (
                        <Cell key={d.range}
                          fill={d.range === '9-10' ? '#f59e0b' : d.range === '7-8' ? '#10b981' : d.range === '4-6' ? '#eab308' : '#f43f5e'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card>
              <CardTitle>По статусам</CardTitle>
              <CardSub className="mb-2">распределение всех откликов</CardSub>
              <div className="flex items-center justify-between gap-3">
                <div className="h-32 w-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Подходит', value: data.kpi.qualified },
                          { name: 'Проверить', value: data.kpi.maybe },
                          { name: 'Отклонены', value: data.kpi.rejected },
                        ]}
                        innerRadius={36}
                        outerRadius={56}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {COLORS.map((c, i) => <Cell key={i} fill={c} stroke="transparent" />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1.5 text-xs">
                  <Legend dot="#10b981" label="Подходят" value={data.kpi.qualified} />
                  <Legend dot="#eab308" label="Проверить" value={data.kpi.maybe} />
                  <Legend dot="#f43f5e" label="Отклонены" value={data.kpi.rejected} />
                </div>
              </div>

              {Object.keys(data.bySource).length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {Object.entries(data.bySource).map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-tg-border bg-tg-surface-2/50 p-3">
                      <p className="text-[11px] uppercase tracking-wider text-tg-hint">{k === 'habr' ? 'Хабр Карьера' : k.toUpperCase()}</p>
                      <p className="mt-1 text-lg font-bold text-tg-text">{v.total}</p>
                      <p className="text-[11px] text-tg-hint">
                        ✅ {v.qualified} · 🟡 {v.maybe} · ❌ {v.rejected}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, suffix, icon, accent }: {
  label: string; value: number | string; suffix?: string;
  icon?: React.ReactNode; accent?: 'emerald' | 'amber' | 'rose' | 'violet';
}) {
  const map = {
    emerald: 'from-emerald-100 text-emerald-800 dark:from-emerald-500/15 dark:text-emerald-300',
    amber: 'from-amber-100 text-amber-800 dark:from-amber-500/15 dark:text-amber-300',
    rose: 'from-rose-100 text-rose-800 dark:from-rose-500/15 dark:text-rose-300',
    violet: 'from-violet-100 text-violet-800 dark:from-violet-500/15 dark:text-violet-300',
  } as const;
  const cls = accent ? map[accent] : 'from-tg-surface-2 text-tg-text';

  return (
    <div className={`relative rounded-2xl border border-tg-border bg-gradient-to-br to-tg-surface-2/40 p-3 ${cls.split(' ')[0]}`}>
      <p className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-tg-hint">
        {icon} {label}
      </p>
      <p className={`mt-1.5 text-2xl font-extrabold leading-none ${cls.split(' ').slice(1).join(' ')}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}{suffix && <span className="ml-0.5 text-sm font-semibold text-tg-hint">{suffix}</span>}
      </p>
    </div>
  );
}

function Legend({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
      <span className="text-tg-hint">{label}</span>
      <span className="ml-auto font-semibold text-tg-text" style={{ fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  );
}
