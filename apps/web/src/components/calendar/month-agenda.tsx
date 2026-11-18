'use client';

import { type CalendarEventDto } from '@lifeos/shared';
import { cn, EmptyState } from '@lifeos/ui';
import { AlertTriangle, CalendarDays, Lock, MapPin, Repeat } from 'lucide-react';
import { useI18n } from '@/i18n/i18n';
import { segmentsFor, zonedParts } from './calendar-model';

const eventColor = (e: CalendarEventDto) => e.color ?? e.category?.color ?? 'var(--accent)';

function eventsOn(day: string, events: CalendarEventDto[], tz: string) {
  return events.filter((e) => {
    const start = zonedParts(e.startAt, tz).dateKey;
    if (start === day) return true;
    return segmentsFor(e.startAt, e.endAt, [day], tz).length > 0;
  });
}

function clock(iso: string, tz: string) {
  const { minutes } = zonedParts(iso, tz);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function MonthGrid({
  days,
  month,
  events,
  timezone,
  today,
  onOpen,
  onPickDay,
}: {
  days: string[];
  month: string;
  events: CalendarEventDto[];
  timezone: string;
  today: string;
  onOpen: (e: CalendarEventDto) => void;
  onPickDay: (day: string) => void;
}) {
  const { t, locale } = useI18n();
  const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' });
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-separator" aria-hidden>
        {days.slice(0, 7).map((d) => (
          <div key={d} className="py-1.5 text-center text-[0.75rem] font-medium uppercase text-tertiary">
            {weekdayFmt.format(new Date(`${d}T12:00:00Z`))}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const list = eventsOn(d, events, timezone);
          const outside = d.slice(0, 7) !== month;
          return (
            <div key={d} className={cn('min-h-[92px] border-b border-l border-separator p-1 sm:min-h-[112px]', outside && 'bg-sunken/40')}>
              <button
                type="button"
                onClick={() => onPickDay(d)}
                aria-label={new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`))}
                className={cn(
                  'mb-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[0.8125rem] tabular-nums hover:bg-sunken',
                  d === today ? 'bg-accent font-semibold text-on-accent hover:bg-accent' : outside ? 'text-tertiary' : 'text-primary',
                )}
              >
                {Number(d.slice(8))}
              </button>
              <ul className="flex flex-col gap-0.5">
                {list.slice(0, 3).map((e) => (
                  <li key={`${e.id}@${e.startAt}`}>
                    <button
                      type="button"
                      onClick={() => onOpen(e)}
                      className="flex w-full items-center gap-1 truncate rounded-[4px] px-1 text-left text-[0.75rem] leading-5 hover:bg-sunken"
                    >
                      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: eventColor(e) }} />
                      {!e.allDay ? <span className="hidden tabular-nums text-secondary sm:inline">{clock(e.startAt, timezone)}</span> : null}
                      <span className="truncate">{e.title}</span>
                    </button>
                  </li>
                ))}
                {list.length > 3 ? (
                  <li>
                    <button type="button" onClick={() => onPickDay(d)} className="px-1 text-[0.75rem] text-secondary hover:underline">
                      {t('calendar.more', { count: list.length - 3 })}
                    </button>
                  </li>
                ) : null}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AgendaList({
  days,
  events,
  timezone,
  conflictIds,
  onOpen,
}: {
  days: string[];
  events: CalendarEventDto[];
  timezone: string;
  conflictIds: Set<string>;
  onOpen: (e: CalendarEventDto) => void;
}) {
  const { t, locale } = useI18n();
  const groups = days.map((d) => ({ day: d, items: eventsOn(d, events, timezone) })).filter((g) => g.items.length);
  if (!groups.length) {
    return <EmptyState icon={<CalendarDays className="h-8 w-8" strokeWidth={1.5} aria-hidden />} title={t('calendar.agendaEmpty')} />;
  }
  return (
    <div className="divide-y divide-separator">
      {groups.map((g) => (
        <section key={g.day} className="px-4 py-3" aria-label={g.day}>
          <h3 className="mb-1.5 text-[0.8125rem] font-semibold text-secondary first-letter:uppercase">
            {new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${g.day}T12:00:00Z`))}
          </h3>
          <ul className="flex flex-col">
            {g.items.map((e) => (
              <li key={`${e.id}@${e.startAt}`}>
                <button type="button" onClick={() => onOpen(e)} className="flex w-full items-start gap-3 rounded-md px-1 py-2 text-left hover:bg-sunken/60">
                  <span className="w-[5.5rem] shrink-0 text-[0.8125rem] tabular-nums text-secondary">
                    {e.allDay ? t('calendar.allDay') : `${clock(e.startAt, timezone)}–${clock(e.endAt, timezone)}`}
                  </span>
                  <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: eventColor(e) }} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[0.9375rem]">
                      {e.title}
                      {e.locked ? <Lock className="h-3.5 w-3.5 text-tertiary" aria-label={t('today.locked')} /> : null}
                      {e.recurrenceRule ? <Repeat className="h-3.5 w-3.5 text-tertiary" aria-label={t('tasks.repeats')} /> : null}
                      {conflictIds.has(e.id) ? <AlertTriangle className="h-3.5 w-3.5 text-warning" aria-label={t('calendar.conflict')} /> : null}
                    </span>
                    {e.location ? (
                      <span className="mt-0.5 flex items-center gap-1 text-[0.8125rem] text-secondary">
                        <MapPin className="h-3.5 w-3.5" aria-hidden />
                        {e.location}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
