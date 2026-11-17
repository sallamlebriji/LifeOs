import { type MyDayEvent } from '@lifeos/shared';

export interface RibbonSegment {
  id: string;
  title: string;
  left: number; // % of the day window
  width: number; // %
  locked: boolean;
  past: boolean;
}

export interface RibbonModel {
  segments: RibbonSegment[];
  /** % position of "now", or null if now is outside the window or not today. */
  now: number | null;
  /** Hour ticks inside the window: { left %, iso }. */
  ticks: { left: number; iso: string }[];
}

/**
 * Projects timed agenda items onto the user's day window as percentages.
 * Items are clipped to the window; overlapping items simply overlay.
 */
export function buildRibbon(
  window: { start: string; end: string },
  agenda: MyDayEvent[],
  now: Date,
  isToday: boolean,
  tickEveryHours = 3,
): RibbonModel {
  const start = new Date(window.start).getTime();
  const end = new Date(window.end).getTime();
  const span = end - start;
  if (span <= 0) return { segments: [], now: null, ticks: [] };
  const pct = (t: number) => ((t - start) / span) * 100;

  const segments = agenda
    .filter((e) => !e.allDay)
    .map((e) => {
      const s = Math.max(start, new Date(e.startAt).getTime());
      const f = Math.min(end, new Date(e.endAt).getTime());
      return { e, s, f };
    })
    .filter(({ s, f }) => f > s)
    .map<RibbonSegment>(({ e, s, f }) => ({
      id: e.id,
      title: e.title,
      left: pct(s),
      width: pct(f) - pct(s),
      locked: e.locked,
      past: isToday && f <= now.getTime(),
    }));

  const n = now.getTime();
  const nowPct = isToday && n >= start && n <= end ? pct(n) : null;

  const ticks: RibbonModel['ticks'] = [];
  const firstHour = new Date(start);
  firstHour.setUTCMinutes(0, 0, 0);
  for (let t = firstHour.getTime(); t <= end; t += 3_600_000) {
    if (t < start) continue;
    const hoursFromStart = Math.round((t - start) / 3_600_000);
    if (hoursFromStart % tickEveryHours === 0) ticks.push({ left: pct(t), iso: new Date(t).toISOString() });
  }
  return { segments, now: nowPct, ticks };
}
