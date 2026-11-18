/**
 * Pure calendar geometry and timezone maths for the calendar views.
 * Everything is computed in the user's preference timezone, not the browser's.
 */
import { addDaysKey, localTimeOnDay, startOfWeekKey } from '@lifeos/shared';

export const HOUR_PX = 48;
export const SNAP_MINUTES = 15;

export type CalendarView = 'day' | 'week' | 'month' | 'agenda';

/** Local date key and minutes since local midnight of an instant in `tz`. */
export function zonedParts(iso: string | Date, tz: string): { dateKey: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(typeof iso === 'string' ? new Date(iso) : iso);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** UTC instant of local `dateKey` + `minutes` (may exceed 1440: rolls into following days). */
export function zonedInstant(dateKey: string, minutes: number, tz: string): Date {
  const dayOffset = Math.floor(minutes / 1440);
  const m = minutes - dayOffset * 1440;
  const key = addDaysKey(dateKey, dayOffset);
  const clock = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return localTimeOnDay(new Date(`${key}T12:00:00Z`), clock, tz);
}

/** "YYYY-MM-DDTHH:mm" in `tz`, for datetime-local inputs. */
export function toZonedInput(iso: string | null | undefined, tz: string): string {
  if (!iso) return '';
  const { dateKey, minutes } = zonedParts(iso, tz);
  return `${dateKey}T${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function fromZonedInput(value: string, tz: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return null;
  return zonedInstant(m[1]!, Number(m[2]) * 60 + Number(m[3]), tz).toISOString();
}

/** Days shown and the UTC range to fetch for a view anchored on `anchor` (a date key). */
export function viewRange(view: CalendarView, anchor: string, weekStartsOn: number, tz: string) {
  let days: string[];
  if (view === 'day') days = [anchor];
  else if (view === 'week') {
    const start = startOfWeekKey(anchor, weekStartsOn);
    days = Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
  } else if (view === 'month') {
    const first = `${anchor.slice(0, 7)}-01`;
    const start = startOfWeekKey(first, weekStartsOn);
    days = Array.from({ length: 42 }, (_, i) => addDaysKey(start, i));
  } else {
    days = Array.from({ length: 30 }, (_, i) => addDaysKey(anchor, i));
  }
  return {
    days,
    from: zonedInstant(days[0]!, 0, tz).toISOString(),
    to: zonedInstant(addDaysKey(days[days.length - 1]!, 1), 0, tz).toISOString(),
  };
}

export function shiftAnchor(view: CalendarView, anchor: string, dir: -1 | 1): string {
  if (view === 'day') return addDaysKey(anchor, dir);
  if (view === 'week') return addDaysKey(anchor, 7 * dir);
  if (view === 'agenda') return addDaysKey(anchor, 30 * dir);
  const [y, m] = anchor.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + dir, 1));
  return d.toISOString().slice(0, 10);
}

export interface Positioned<T> {
  item: T;
  top: number;
  height: number;
  /** Column index and count within its overlap cluster (side-by-side layout). */
  col: number;
  cols: number;
}

/**
 * Lays out one day's timed segments: overlapping items share the width.
 * Items are [startMin, endMin) within the day (already clipped to 0–1440).
 */
export function layoutDay<T>(items: ReadonlyArray<{ item: T; start: number; end: number }>): Positioned<T>[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Positioned<T>[] = [];
  let cluster: Array<{ entry: (typeof sorted)[number]; col: number }> = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...cluster.map((c) => c.col + 1));
    for (const c of cluster) {
      out.push({
        item: c.entry.item,
        top: (c.entry.start / 60) * HOUR_PX,
        height: Math.max(18, ((c.entry.end - c.entry.start) / 60) * HOUR_PX - 2),
        col: c.col,
        cols,
      });
    }
    cluster = [];
  };
  for (const entry of sorted) {
    if (entry.start >= clusterEnd && cluster.length) flush();
    const columnsEnd: number[] = [];
    for (const c of cluster) columnsEnd[c.col] = Math.max(columnsEnd[c.col] ?? -1, c.entry.end);
    let col = columnsEnd.findIndex((end) => end <= entry.start);
    if (col === -1) col = columnsEnd.length;
    cluster.push({ entry, col });
    clusterEnd = Math.max(clusterEnd, entry.end);
  }
  if (cluster.length) flush();
  return out;
}

/** Splits an event into per-day segments (minutes) for the time grid. */
export function segmentsFor(startIso: string, endIso: string, days: readonly string[], tz: string) {
  const s = zonedParts(startIso, tz);
  const e = zonedParts(endIso, tz);
  const out: Array<{ dateKey: string; start: number; end: number }> = [];
  for (const day of days) {
    if (day < s.dateKey || day > e.dateKey) continue;
    const start = day === s.dateKey ? s.minutes : 0;
    const end = day === e.dateKey ? e.minutes : 1440;
    if (end > start) out.push({ dateKey: day, start, end });
  }
  return out;
}

export const snap = (minutes: number) => Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
