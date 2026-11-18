'use client';

import { type CalendarEventDto, type EventMutationResponse } from '@lifeos/shared';
import { Button, ErrorState, Segmented, Surface } from '@lifeos/ui';
import { AlertTriangle, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { type CalendarView, shiftAnchor, viewRange, zonedInstant, zonedParts } from '@/components/calendar/calendar-model';
import { type EventDraft, EventSheet } from '@/components/calendar/event-sheet';
import { AgendaList, MonthGrid } from '@/components/calendar/month-agenda';
import { TimeGrid } from '@/components/calendar/time-grid';
import { useI18n } from '@/i18n/i18n';
import { ApiError } from '@/lib/api';
import { useCalendarRange, useUpdateEvent } from '@/lib/module-queries';
import { useMe } from '@/lib/queries';

const VIEW_KEY = 'lifeos-calendar-view';

export default function CalendarPage() {
  const { t, locale } = useI18n();
  const me = useMe();
  const tz = me.data?.preferences?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const weekStartsOn = me.data?.preferences?.weekStartsOn ?? 1;
  const [now, setNow] = useState(() => new Date());
  const today = zonedParts(now, tz).dateKey;
  const [view, setView] = useState<CalendarView>('week');
  const [anchor, setAnchor] = useState<string | null>(null);
  const current = anchor ?? today;
  const { days, from, to } = useMemo(() => viewRange(view, current, weekStartsOn, tz), [view, current, weekStartsOn, tz]);
  const range = useCalendarRange(from, to);
  const move = useUpdateEvent();
  const [sheet, setSheet] = useState<{ open: boolean; event: CalendarEventDto | null; draft: EventDraft | null }>({ open: false, event: null, draft: null });
  const [notice, setNotice] = useState<{ tone: 'warning' | 'critical'; text: string } | null>(null);

  useEffect(() => {
    document.title = `${t('nav.calendar')} · LifeOS`;
    try {
      const saved = localStorage.getItem(VIEW_KEY) as CalendarView | null;
      if (saved && ['day', 'week', 'month', 'agenda'].includes(saved)) setView(saved);
      else if (window.matchMedia('(max-width: 640px)').matches) setView('day');
    } catch {
      /* storage unavailable */
    }
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, [t]);

  const changeView = (v: CalendarView) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const events = range.data?.events ?? [];
  const conflicts = range.data?.conflicts ?? [];
  const conflictIds = useMemo(() => new Set(conflicts.flatMap((c) => [c.a.id, c.b.id])), [conflicts]);

  const title = useMemo(() => {
    const d = (key: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...o, timeZone: 'UTC' }).format(new Date(`${key}T12:00:00Z`));
    if (view === 'day') return d(current, { weekday: 'long', day: 'numeric', month: 'long' });
    if (view === 'month') return d(current, { month: 'long', year: 'numeric' });
    return `${d(days[0]!, { day: 'numeric', month: 'short' })} – ${d(days[days.length - 1]!, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }, [view, current, days, locale]);

  function saved(result: EventMutationResponse) {
    setNotice(
      result.conflicts.length
        ? { tone: 'warning', text: t('calendar.overlaps', { title: result.event.title, list: result.conflicts.map((c) => c.title).join(', ') }) }
        : null,
    );
  }

  function onMove(event: CalendarEventDto, startAt: string, endAt: string) {
    // Recurring: apply the same shift to the series anchor.
    const delta = new Date(startAt).getTime() - new Date(event.startAt).getTime();
    const duration = new Date(endAt).getTime() - new Date(startAt).getTime();
    const seriesStart = new Date(new Date(event.seriesStartAt).getTime() + delta);
    move.mutate(
      {
        id: event.id,
        version: event.version,
        startAt: seriesStart.toISOString(),
        endAt: new Date(seriesStart.getTime() + duration).toISOString(),
      },
      {
        onSuccess: saved,
        onError: (err) => setNotice({ tone: 'critical', text: err instanceof ApiError ? err.message : t('common.loadError') }),
      },
    );
  }

  const newEvent = () => {
    const start = Math.min(22 * 60, Math.ceil((zonedParts(now, tz).minutes + 1) / 30) * 30);
    const day = view === 'month' || view === 'agenda' ? current : (days.includes(today) ? today : days[0]!);
    setSheet({
      open: true,
      event: null,
      draft: { startAt: zonedInstant(day, start, tz).toISOString(), endAt: zonedInstant(day, start + 60, tz).toISOString() },
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col pt-4 sm:pt-6">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto min-w-0 font-display text-[1.75rem] font-bold leading-tight tracking-[-0.02em] first-letter:uppercase sm:text-[2rem]">{title}</h1>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={t('calendar.previous')} onClick={() => setAnchor(shiftAnchor(view, current, -1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAnchor(null)} disabled={current === today}>
            {t('today.backToToday')}
          </Button>
          <Button variant="ghost" size="icon" aria-label={t('calendar.next')} onClick={() => setAnchor(shiftAnchor(view, current, 1))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
        <Segmented
          label={t('calendar.view')}
          value={view}
          onChange={changeView}
          options={[
            { value: 'day', label: t('calendar.day') },
            { value: 'week', label: t('calendar.week') },
            { value: 'month', label: t('calendar.month') },
            { value: 'agenda', label: t('calendar.agenda') },
          ]}
        />
        <Button onClick={newEvent}>
          <Plus className="h-4 w-4" aria-hidden />
          {t('calendar.newEvent')}
        </Button>
      </header>

      <div aria-live="polite">
        {notice ? (
          <div
            role="status"
            className={`mb-3 flex items-start gap-2 rounded-md px-3 py-2 text-[0.875rem] ${notice.tone === 'warning' ? 'bg-warning-soft text-warning' : 'bg-critical-soft text-critical'}`}
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="flex-1">{notice.text}</span>
            <button type="button" aria-label={t('common.close')} onClick={() => setNotice(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : conflicts.length ? (
          <p className="mb-3 flex items-center gap-2 text-[0.875rem] text-warning">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {t('calendar.conflictsInView', { count: conflicts.length })}
          </p>
        ) : null}
      </div>

      <Surface className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {range.isError ? (
          <ErrorState title={t('common.loadError')} onRetry={() => range.refetch()} />
        ) : view === 'month' ? (
          <MonthGrid
            days={days}
            month={current.slice(0, 7)}
            events={events}
            timezone={tz}
            today={today}
            onOpen={(event) => setSheet({ open: true, event, draft: null })}
            onPickDay={(d) => {
              setAnchor(d);
              changeView('day');
            }}
          />
        ) : view === 'agenda' ? (
          <AgendaList days={days} events={events} timezone={tz} conflictIds={conflictIds} onOpen={(event) => setSheet({ open: true, event, draft: null })} />
        ) : (
          <TimeGrid
            days={days}
            events={events}
            taskBlocks={range.data?.taskBlocks ?? []}
            conflictIds={conflictIds}
            timezone={tz}
            now={now}
            onCreate={(startAt, endAt) => setSheet({ open: true, event: null, draft: { startAt, endAt } })}
            onOpen={(event) => setSheet({ open: true, event, draft: null })}
            onMove={onMove}
          />
        )}
      </Surface>

      <EventSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        event={sheet.event}
        draft={sheet.draft}
        timezone={tz}
        onSaved={saved}
      />
    </div>
  );
}
