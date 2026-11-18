'use client';

import { addDaysKey } from '@lifeos/shared';
import { Button, ErrorState, ProgressBar, Segmented, Skeleton, Surface } from '@lifeos/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { PageHeader } from '@/components/ui/sheet';
import { useI18n } from '@/i18n/i18n';
import { formatDuration } from '@/lib/format';
import { useAnalytics } from '@/lib/module-queries';

function Tile({ label, value, detail }: { label: string; value: ReactNode; detail?: ReactNode }) {
  return (
    <Surface className="p-4">
      <p className="text-[0.8125rem] font-medium text-secondary">{label}</p>
      <p className="mt-1 text-[1.625rem] font-bold leading-tight tabular-nums">{value}</p>
      {detail ? <p className="mt-0.5 text-[0.8125rem] text-secondary">{detail}</p> : null}
    </Surface>
  );
}

export default function AnalyticsPage() {
  const { t, locale } = useI18n();
  const [period, setPeriod] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState<string | undefined>();
  const report = useAnalytics(period, anchor);
  const r = report.data;
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    document.title = `${t('nav.analytics')} · LifeOS`;
  }, [t]);

  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const day = (key: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));
  const shift = (dir: -1 | 1) => {
    if (!r) return;
    setAnchor(period === 'week' ? addDaysKey(r.start, 7 * dir) : dir === 1 ? addDaysKey(r.end, 1) : addDaysKey(r.start, -1));
  };
  const maxFocus = Math.max(60, ...(r?.daily.map((d) => d.focusMinutes) ?? [0]));
  const maxCat = Math.max(1, ...(r?.timeByCategory.map((c) => c.minutes) ?? [0]));

  return (
    <div className="mx-auto w-full max-w-[1040px] pt-4 sm:pt-6">
      <PageHeader
        title={t('nav.analytics')}
        subtitle={r ? `${day(r.start, { day: 'numeric', month: 'long' })} – ${day(r.end, { day: 'numeric', month: 'long', year: 'numeric' })}` : ' '}
        actions={
          <>
            <Button variant="ghost" size="icon" aria-label={t('calendar.previous')} onClick={() => shift(-1)}><ChevronLeft className="h-5 w-5" /></Button>
            <Button variant="secondary" size="sm" disabled={!anchor} onClick={() => setAnchor(undefined)}>{t('analytics.current')}</Button>
            <Button variant="ghost" size="icon" aria-label={t('calendar.next')} onClick={() => shift(1)}><ChevronRight className="h-5 w-5" /></Button>
            <Segmented label={t('analytics.period')} value={period} onChange={(v) => (setPeriod(v), setAnchor(undefined))} options={[{ value: 'week', label: t('calendar.week') }, { value: 'month', label: t('calendar.month') }]} />
          </>
        }
      />

      {report.isError ? (
        <Surface><ErrorState title={t('common.loadError')} onRetry={() => report.refetch()} /></Surface>
      ) : !r ? (
        <div className="grid gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label={t('analytics.tasksDone')} value={r.tasks.completed} detail={t('analytics.completionRate', { pct: pct(r.tasks.completionRate) })} />
            <Tile label={t('analytics.habits')} value={pct(r.habits.consistency)} detail={t('analytics.habitsDetail')} />
            <Tile label={t('analytics.workouts')} value={r.workouts.sessions} detail={formatDuration(r.workouts.minutes, locale)} />
            <Tile label={t('analytics.study')} value={formatDuration(r.study.minutes, locale)} detail={t('analytics.reviews', { count: r.study.reviewsDone })} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Surface className="p-5">
              <h2 className="text-[1.0625rem] font-semibold">{t('analytics.focusPerDay')}</h2>
              <p className="mb-4 text-[0.8125rem] text-secondary">{t('analytics.focusHint')}</p>
              <div className="relative flex h-36 items-end gap-1" role="img" aria-label={t('analytics.focusPerDay')}>
                {r.daily.map((d, i) => (
                  <div
                    key={d.date}
                    className="flex h-full flex-1 items-end justify-center"
                    onMouseEnter={() => setHover(i)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <div className="w-full max-w-6 rounded-t-[4px] bg-accent" style={{ height: `${(d.focusMinutes / maxFocus) * 100}%`, minHeight: d.focusMinutes ? 3 : 0, opacity: hover === null || hover === i ? 1 : 0.5 }} />
                  </div>
                ))}
                {hover !== null && r.daily[hover] ? (
                  <div role="tooltip" className="pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 rounded-md bg-overlay px-2.5 py-1.5 text-[0.75rem] text-white shadow-md">
                    {day(r.daily[hover]!.date, { weekday: 'short', day: 'numeric' })} · {formatDuration(r.daily[hover]!.focusMinutes, locale)} · {t('analytics.tasksCount', { count: r.daily[hover]!.tasksCompleted })}
                  </div>
                ) : null}
              </div>
              <div className="mt-1 flex gap-1" aria-hidden>
                {r.daily.map((d, i) => (
                  <span key={d.date} className="flex-1 text-center text-[0.6875rem] tabular-nums text-tertiary">
                    {period === 'week' ? day(d.date, { weekday: 'narrow' }) : i % 5 === 0 ? Number(d.date.slice(8)) : ''}
                  </span>
                ))}
              </div>
              <table className="sr-only">
                <caption>{t('analytics.focusPerDay')}</caption>
                <tbody>{r.daily.map((d) => <tr key={d.date}><th>{d.date}</th><td>{d.focusMinutes} min</td><td>{d.tasksCompleted}</td></tr>)}</tbody>
              </table>
            </Surface>

            <Surface className="p-5">
              <h2 className="mb-4 text-[1.0625rem] font-semibold">{t('analytics.timeByCategory')}</h2>
              {r.timeByCategory.length === 0 ? (
                <p className="text-[0.875rem] text-tertiary">{t('analytics.noTime')}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {r.timeByCategory.map((c) => (
                    <li key={c.name}>
                      <div className="mb-1 flex justify-between text-[0.8125rem]">
                        <span className="inline-flex items-center gap-1.5">
                          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: c.color }} />
                          {c.name}
                        </span>
                        <span className="tabular-nums text-secondary">{formatDuration(c.minutes, locale)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-sunken">
                        <div className="h-full rounded-full" style={{ width: `${(c.minutes / maxCat) * 100}%`, background: c.color }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Surface>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Surface className="p-5">
              <h2 className="mb-3 text-[1.0625rem] font-semibold">{t('analytics.estimates')}</h2>
              <p className="text-[0.875rem] text-secondary">{t('analytics.estimatesHint')}</p>
              <dl className="mt-3 grid grid-cols-2 gap-3 tabular-nums">
                <div><dt className="text-[0.75rem] text-secondary">{t('analytics.estimated')}</dt><dd className="text-[1.25rem] font-semibold">{formatDuration(r.plannedVsActual.plannedMinutes, locale)}</dd></div>
                <div><dt className="text-[0.75rem] text-secondary">{t('analytics.tracked')}</dt><dd className="text-[1.25rem] font-semibold">{formatDuration(r.plannedVsActual.trackedMinutes, locale)}</dd></div>
              </dl>
            </Surface>
            <Surface className="p-5">
              <h2 className="mb-3 text-[1.0625rem] font-semibold">{t('nav.habits')}</h2>
              {r.habits.perHabit.length === 0 ? <p className="text-[0.875rem] text-tertiary">{t('habits.empty')}</p> : (
                <ul className="flex flex-col gap-2.5">
                  {r.habits.perHabit.map((h) => (
                    <li key={h.name}>
                      <div className="mb-1 flex justify-between text-[0.8125rem]"><span>{h.name}</span><span className="tabular-nums text-secondary">{h.done}/{h.due}</span></div>
                      <ProgressBar value={h.due ? h.done / h.due : 0} label={h.name} />
                    </li>
                  ))}
                </ul>
              )}
            </Surface>
            <Surface className="p-5">
              <h2 className="mb-3 text-[1.0625rem] font-semibold">{t('nav.goals')}</h2>
              {r.goals.length === 0 ? <p className="text-[0.875rem] text-tertiary">{t('goals.empty')}</p> : (
                <ul className="flex flex-col gap-2.5">
                  {r.goals.map((g) => (
                    <li key={g.title}>
                      <div className="mb-1 flex justify-between text-[0.8125rem]"><span className="truncate">{g.title}</span><span className="tabular-nums text-secondary">{pct(g.progress)}</span></div>
                      <ProgressBar value={g.progress} label={g.title} />
                    </li>
                  ))}
                </ul>
              )}
            </Surface>
          </div>
          {r.tasks.overdueOpen ? <p className="px-1 text-[0.875rem] text-warning">{t('analytics.overdue', { count: r.tasks.overdueOpen })}</p> : null}
        </div>
      )}
    </div>
  );
}
