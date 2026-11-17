import { TZDate } from '@date-fns/tz';
import { addDays, startOfDay } from 'date-fns';

export interface UtcRange {
  start: Date;
  end: Date;
}

/** Parses "HH:mm" into minutes since midnight. Throws on malformed input. */
export function parseClock(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error(`Invalid clock time "${value}" (expected HH:mm)`);
  return Number(match[1]) * 60 + Number(match[2]);
}

/** Calendar date (YYYY-MM-DD) of `instant` as seen in `timeZone`. */
export function localDateKey(instant: Date, timeZone: string): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * UTC instants bounding the local calendar day containing `instant` in `timeZone`.
 * DST-safe: the day may be 23, 24 or 25 hours long.
 */
export function localDayRange(instant: Date, timeZone: string): UtcRange {
  const local = new TZDate(instant.getTime(), timeZone);
  const start = startOfDay(local);
  const end = startOfDay(addDays(start, 1));
  return { start: new Date(start.getTime()), end: new Date(end.getTime()) };
}

/** UTC instant for a wall-clock time ("HH:mm") on the local day containing `instant`. */
export function localTimeOnDay(instant: Date, clock: string, timeZone: string): Date {
  const minutes = parseClock(clock);
  const local = new TZDate(instant.getTime(), timeZone);
  const atClock = new TZDate(
    local.getFullYear(),
    local.getMonth(),
    local.getDate(),
    Math.floor(minutes / 60),
    minutes % 60,
    0,
    timeZone,
  );
  return new Date(atClock.getTime());
}

/** Weekday index (0 = Sunday) of `instant` in `timeZone`. */
export function localWeekday(instant: Date, timeZone: string): number {
  return new TZDate(instant.getTime(), timeZone).getDay();
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function minutesBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}
