'use client';

import { type CalendarEventDto, type TaskBlockDto } from '@lifeos/shared';
import { cn } from '@lifeos/ui';
import { AlertTriangle, Lock, Repeat } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/i18n/i18n';
import { HOUR_PX, layoutDay, segmentsFor, snap, zonedInstant, zonedParts } from './calendar-model';

interface Drag {
  event: CalendarEventDto;
  mode: 'move' | 'resize';
  originX: number;
  originY: number;
  dMinutes: number;
  dDays: number;
  moved: boolean;
}

const eventColor = (e: CalendarEventDto) => e.color ?? e.category?.color ?? 'var(--accent)';

/**
 * Day/week time grid. Drag an event to move it (15-minute snap, across days in
 * week view) or drag its bottom edge to resize. Locked events don't drag; every
 * event is also a button that opens the editor, so nothing depends on dragging.
 */
export function TimeGrid({
  days,
  events,
  taskBlocks = [],
  conflictIds,
  timezone,
  now,
  onCreate,
  onOpen,
  onMove,
}: {
  days: string[];
  events: CalendarEventDto[];
  taskBlocks?: TaskBlockDto[];
  conflictIds: Set<string>;
  timezone: string;
  now: Date;
  onCreate: (startAt: string, endAt: string) => void;
  onOpen: (event: CalendarEventDto) => void;
  onMove: (event: CalendarEventDto, startAt: string, endAt: string) => void;
}) {
  const { t, locale } = useI18n();
  const scroller = useRef<HTMLDivElement>(null);
  const columns = useRef<HTMLDivElement>(null);
  const [drag, setDragState] = useState<Drag | null>(null);
  // The latest drag lives in a ref too: pointerup can fire before React re-renders.
  const dragRef = useRef<Drag | null>(null);
  const setDrag = (d: Drag | null) => {
    dragRef.current = d;
    setDragState(d);
  };
  const today = zonedParts(now, timezone);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 7 * HOUR_PX - 8 });
  }, []);

  const timed = events.filter((e) => !e.allDay);
  const allDay = events.filter((e) => e.allDay);

  const display = (e: CalendarEventDto) => {
    if (!drag || drag.event !== e) return { startAt: e.startAt, endAt: e.endAt };
    const shift = (drag.dMinutes + drag.dDays * 1440) * 60_000;
    const start = new Date(e.startAt).getTime() + (drag.mode === 'move' ? shift : 0);
    let end = new Date(e.endAt).getTime() + shift;
    if (drag.mode === 'resize') end = Math.max(start + 15 * 60_000, new Date(e.endAt).getTime() + drag.dMinutes * 60_000);
    return { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() };
  };

  const perDay = useMemo(() => {
    const map = new Map<string, Array<{ item: CalendarEventDto; start: number; end: number }>>();
    for (const e of timed) {
      const { startAt, endAt } = display(e);
      for (const seg of segmentsFor(startAt, endAt, days, timezone)) {
        (map.get(seg.dateKey) ?? map.set(seg.dateKey, []).get(seg.dateKey)!).push({ item: e, start: seg.start, end: seg.end });
      }
    }
    return new Map([...map].map(([k, v]) => [k, layoutDay(v)]));
  }, [timed, days, timezone, drag]);

  function startDrag(e: ReactPointerEvent, event: CalendarEventDto, mode: Drag['mode']) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setDrag({ event, mode, originX: e.clientX, originY: e.clientY, dMinutes: 0, dDays: 0, moved: false });
  }

  // Track the pointer on the window: the dragged block can re-mount in another
  // day column mid-drag, so element-level pointerup would be lost.
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    const onMoveEvt = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.originX;
      const dy = e.clientY - d.originY;
      const moved = d.moved || Math.abs(dy) > 4 || Math.abs(dx) > 4;
      if (d.event.locked || d.event.allDay) {
        if (moved !== d.moved) setDrag({ ...d, moved });
        return;
      }
      const colWidth = Math.max(1, ((columns.current?.clientWidth ?? 0) - 56) / days.length);
      const dDays = d.mode === 'move' && days.length > 1 ? Math.round(dx / colWidth) : 0;
      const dMinutes = snap((dy / HOUR_PX) * 60);
      if (dMinutes !== d.dMinutes || dDays !== d.dDays || moved !== d.moved) setDrag({ ...d, dMinutes, dDays, moved });
    };
    const onUp = () => {
      const d = dragRef.current;
      if (!d) return;
      setDrag(null);
      const event = d.event;
      if (!d.moved) {
        onOpen(event);
        return;
      }
      if (event.locked || event.allDay || (d.dMinutes === 0 && d.dDays === 0)) return;
      const shift = (d.dMinutes + d.dDays * 1440) * 60_000;
      const startAt = d.mode === 'move' ? new Date(new Date(event.startAt).getTime() + shift).toISOString() : event.startAt;
      const endAt =
        d.mode === 'move'
          ? new Date(new Date(event.endAt).getTime() + shift).toISOString()
          : new Date(Math.max(new Date(event.startAt).getTime() + 15 * 60_000, new Date(event.endAt).getTime() + d.dMinutes * 60_000)).toISOString();
      onMove(event, startAt, endAt);
    };
    const onCancel = () => setDrag(null);
    window.addEventListener('pointermove', onMoveEvt);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMoveEvt);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [dragging, days.length, onMove, onOpen]);

  function createAt(e: ReactPointerEvent<HTMLDivElement>, day: string) {
    if (e.target !== e.currentTarget) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const minutes = Math.min(1410, Math.max(0, Math.floor(((e.clientY - rect.top) / HOUR_PX) * 2) * 30));
    onCreate(zonedInstant(day, minutes, timezone).toISOString(), zonedInstant(day, minutes + 60, timezone).toISOString());
  }

  const timeFmt = (iso: string) => {
    const { minutes } = zonedParts(iso, timezone);
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  };
  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Day headers + all-day row */}
      <div className="grid border-b border-separator" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
        <div />
        {days.map((d) => (
          <div key={d} className="min-w-0 px-1.5 pb-1.5 pt-1 text-center">
            <div className={cn('text-[0.8125rem] font-medium first-letter:uppercase', d === today.dateKey ? 'text-accent' : 'text-secondary')}>
              {dayFmt.format(new Date(`${d}T12:00:00Z`))}
            </div>
            <div className="mt-1 flex flex-col gap-0.5">
              {allDay
                .filter((e) => segmentsFor(e.startAt, e.endAt, [d], timezone).length || zonedParts(e.startAt, timezone).dateKey === d)
                .map((e) => (
                  <button
                    key={`${e.id}@${e.startAt}`}
                    type="button"
                    onClick={() => onOpen(e)}
                    className="truncate rounded-sm px-1.5 py-0.5 text-left text-[0.75rem] font-medium text-white"
                    style={{ background: eventColor(e) }}
                  >
                    {e.title}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>

      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto" style={{ maxHeight: 'calc(100dvh - 260px)' }}>
        <div ref={columns} className="grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))`, height: 24 * HOUR_PX }}>
          <div className="relative" aria-hidden>
            {Array.from({ length: 23 }, (_, i) => (
              <span key={i} className="absolute right-2 -translate-y-1/2 text-[0.6875rem] tabular-nums text-tertiary" style={{ top: (i + 1) * HOUR_PX }}>
                {String(i + 1).padStart(2, '0')}:00
              </span>
            ))}
          </div>
          <div className="contents">
            {days.map((day) => (
              <div
                key={day}
                role="presentation"
                className="relative border-l border-separator"
                style={{
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HOUR_PX - 1}px, var(--separator) ${HOUR_PX - 1}px, var(--separator) ${HOUR_PX}px)`,
                }}
                onPointerUp={(e) => !dragRef.current && createAt(e, day)}
              >
                {day === today.dateKey ? (
                  <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: (today.minutes / 60) * HOUR_PX }} aria-hidden>
                    <span className="-ml-1 h-2 w-2 rounded-full bg-critical" />
                    <span className="h-[2px] flex-1 bg-critical" />
                  </div>
                ) : null}
                {taskBlocks.flatMap((b) =>
                  segmentsFor(b.startAt, b.endAt, [day], timezone).map((seg) => (
                    <div
                      key={`${b.id}@${day}`}
                      role="note"
                      aria-label={`${t('calendar.taskBlock')}: ${b.title}, ${timeFmt(b.startAt)}–${timeFmt(b.endAt)}`}
                      className={cn(
                        'pointer-events-none absolute inset-x-0.5 z-[5] overflow-hidden rounded-[6px] border border-dashed border-accent/60 bg-accent-soft/60 px-1.5 py-1 text-[0.75rem] leading-tight',
                        b.taskStatus === 'COMPLETED' && 'opacity-50',
                      )}
                      style={{ top: (seg.start / 60) * HOUR_PX, height: Math.max(18, ((seg.end - seg.start) / 60) * HOUR_PX - 2) }}
                    >
                      <span className={cn('block truncate font-medium text-accent', b.taskStatus === 'COMPLETED' && 'line-through')}>{b.title}</span>
                    </div>
                  )),
                )}
                {(perDay.get(day) ?? []).map((p) => {
                  const e = p.item;
                  const shown = display(e);
                  const conflict = conflictIds.has(e.id);
                  const isDragged = drag?.event === e && drag.moved;
                  return (
                    <div
                      key={`${e.id}@${e.startAt}@${day}`}
                      className={cn('absolute z-10 px-0.5', isDragged && 'z-30')}
                      style={{ top: p.top, height: p.height, left: `${(p.col / p.cols) * 100}%`, width: `${100 / p.cols}%` }}
                    >
                      <button
                        type="button"
                        aria-label={`${e.title}, ${timeFmt(shown.startAt)}–${timeFmt(shown.endAt)}${e.locked ? `, ${t('today.locked')}` : ''}${conflict ? `, ${t('calendar.conflict')}` : ''}`}
                        onPointerDown={(ev) => startDrag(ev, e, 'move')}
                        onKeyDown={(ev) => (ev.key === 'Enter' || ev.key === ' ') && onOpen(e)}
                        className={cn(
                          'group relative flex h-full w-full touch-none flex-col overflow-hidden rounded-[6px] border-l-[3px] px-1.5 py-1 text-left text-[0.75rem] leading-tight focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/40',
                          e.locked ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
                          isDragged && 'shadow-lg ring-2 ring-accent/50',
                          conflict && 'outline outline-2 outline-offset-[-2px] outline-[color:var(--signal-warning)]',
                        )}
                        style={{ borderColor: eventColor(e), background: `color-mix(in srgb, ${eventColor(e)} 18%, var(--surface-raised))` }}
                      >
                        <span className="flex items-center gap-1 font-semibold text-primary">
                          {e.locked ? <Lock className="h-3 w-3 shrink-0" aria-hidden /> : null}
                          {conflict ? <AlertTriangle className="h-3 w-3 shrink-0 text-warning" aria-hidden /> : null}
                          <span className="truncate">{e.title}</span>
                          {e.recurrenceRule ? <Repeat className="h-3 w-3 shrink-0 text-secondary" aria-hidden /> : null}
                        </span>
                        {p.height > 30 ? (
                          <span className="tabular-nums text-secondary">
                            {timeFmt(shown.startAt)}–{timeFmt(shown.endAt)}
                          </span>
                        ) : null}
                        {!e.locked ? (
                          <span
                            aria-hidden
                            onPointerDown={(ev) => startDrag(ev, e, 'resize')}
                            className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
                          />
                        ) : null}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
