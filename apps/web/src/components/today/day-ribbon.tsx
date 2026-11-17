'use client';

import { type MyDayResponse } from '@lifeos/shared';
import { cn } from '@lifeos/ui';
import { Lock } from 'lucide-react';
import { useMemo } from 'react';
import { useI18n } from '@/i18n/i18n';
import { formatDuration, formatTime } from '@/lib/format';
import { buildRibbon } from './ribbon-model';

/**
 * Signature element: today as one bar, from the start to the end of the
 * user's day. Busy blocks, free gaps and "now" at a glance. The same facts
 * are given as text (headline + list) for assistive technology.
 */
export function DayRibbon({ day, now }: { day: MyDayResponse; now: Date }) {
  const { t, locale } = useI18n();
  const model = useMemo(
    () => buildRibbon(day.dayWindow, day.agenda, now, day.isToday),
    [day.dayWindow, day.agenda, now, day.isToday],
  );
  const tz = day.timezone;
  const free = day.stats.freeMinutes;

  return (
    <section aria-labelledby="ribbon-heading" className="rounded-xl bg-raised p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="ribbon-heading" className="font-display text-[1.375rem] font-semibold tracking-[-0.02em] tabular">
          {free > 0
            ? t(day.isToday ? 'today.freeLeftToday' : 'today.freeLeft', { time: formatDuration(free, locale) })
            : t('today.noFreeTime')}
        </h2>
        <p className="text-[0.875rem] text-secondary tabular">
          {t('today.scheduled', { time: formatDuration(day.stats.scheduledMinutes, locale) })}
        </p>
      </div>

      <div className="relative mt-5" aria-hidden="true">
        <div className="relative h-11 overflow-hidden rounded-md bg-sunken">
          {model.segments.map((s) => (
            <div
              key={s.id}
              title={s.title}
              className={cn(
                'absolute inset-y-1 rounded-[6px] transition-opacity',
                s.past && 'opacity-45',
              )}
              style={{
                left: `${s.left}%`,
                width: `max(${s.width}%, 3px)`,
                background: s.locked ? 'var(--ribbon-busy-locked)' : 'var(--ribbon-busy)',
              }}
            >
              {s.width > 9 ? (
                <span className="flex h-full items-center gap-1 truncate px-2 text-[0.75rem] font-medium text-primary">
                  {s.locked ? <Lock className="h-3 w-3 shrink-0" /> : null}
                  <span className="truncate">{s.title}</span>
                </span>
              ) : null}
            </div>
          ))}
        </div>
        {model.now !== null ? (
          <div className="pointer-events-none absolute -top-1.5 bottom-0" style={{ left: `${model.now}%` }}>
            <div className="absolute -left-[5px] -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--ribbon-now)]" />
            <div className="absolute -left-px top-1 bottom-0 w-0.5 rounded-full bg-[var(--ribbon-now)]" />
          </div>
        ) : null}
        <div className="relative mt-2 h-4 text-[0.75rem] text-tertiary tabular">
          {model.ticks.map((tick, i) => (
            <span
              key={tick.iso}
              className={cn(
                'absolute whitespace-nowrap',
                i === 0 ? 'translate-x-0' : tick.left > 96 ? '-translate-x-full' : '-translate-x-1/2',
              )}
              style={{ left: `${tick.left}%` }}
            >
              {formatTime(tick.iso, tz, locale)}
            </span>
          ))}
        </div>
      </div>
      <p className="sr-only">
        {t('today.ribbonLabel', {
          start: formatTime(day.dayWindow.start, tz, locale),
          end: formatTime(day.dayWindow.end, tz, locale),
        })}
      </p>
    </section>
  );
}
