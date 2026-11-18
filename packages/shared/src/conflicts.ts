export interface TimedItem {
  id: string;
  start: Date;
  end: Date;
}

export interface Conflict {
  a: string;
  b: string;
  start: Date;
  end: Date;
  overlapMinutes: number;
}

/**
 * Every pair of items whose time ranges overlap (touching edges don't count).
 * Sweep over items sorted by start: O(n log n + k) for k conflicts.
 */
export function findConflicts(items: readonly TimedItem[]): Conflict[] {
  const sorted = [...items]
    .filter((i) => i.end > i.start)
    .sort((x, y) => x.start.getTime() - y.start.getTime() || x.end.getTime() - y.end.getTime());
  const active: TimedItem[] = [];
  const out: Conflict[] = [];
  for (const item of sorted) {
    for (let i = active.length - 1; i >= 0; i--) {
      if (active[i]!.end <= item.start) active.splice(i, 1);
    }
    for (const other of active) {
      const start = item.start;
      const end = other.end < item.end ? other.end : item.end;
      out.push({
        a: other.id,
        b: item.id,
        start,
        end,
        overlapMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
      });
    }
    active.push(item);
  }
  return out;
}

/** Items in `items` that overlap `candidate` (excluding itself by id). */
export function overlapping<T extends TimedItem>(candidate: TimedItem, items: readonly T[]): T[] {
  return items.filter((i) => i.id !== candidate.id && i.start < candidate.end && i.end > candidate.start);
}
