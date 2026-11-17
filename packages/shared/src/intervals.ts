export interface Interval {
  start: Date;
  end: Date;
}

/** Merges overlapping/adjacent intervals. Input need not be sorted. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end.getTime() > i.start.getTime())
    .map((i) => ({ start: new Date(i.start), end: new Date(i.end) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && current.start.getTime() <= last.end.getTime()) {
      if (current.end.getTime() > last.end.getTime()) last.end = current.end;
    } else {
      merged.push(current);
    }
  }
  return merged;
}

/** Gaps inside `window` not covered by any of `busy`. */
export function freeIntervals(window: Interval, busy: Interval[]): Interval[] {
  const clipped = busy
    .map((b) => ({
      start: new Date(Math.max(b.start.getTime(), window.start.getTime())),
      end: new Date(Math.min(b.end.getTime(), window.end.getTime())),
    }))
    .filter((b) => b.end.getTime() > b.start.getTime());
  const free: Interval[] = [];
  let cursor = window.start.getTime();
  for (const b of mergeIntervals(clipped)) {
    if (b.start.getTime() > cursor) free.push({ start: new Date(cursor), end: new Date(b.start) });
    cursor = Math.max(cursor, b.end.getTime());
  }
  if (cursor < window.end.getTime()) {
    free.push({ start: new Date(cursor), end: new Date(window.end) });
  }
  return free;
}

export function totalMinutes(intervals: Interval[]): number {
  return intervals.reduce((sum, i) => sum + (i.end.getTime() - i.start.getTime()) / 60_000, 0);
}
