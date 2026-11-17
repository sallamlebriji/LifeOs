/** Locale/timezone-aware formatting. All instants arrive as UTC ISO strings. */

export function formatTime(iso: string, timeZone: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23', // 24-hour everywhere: compact, unambiguous, matches API insight text
  }).format(
    new Date(iso),
  );
}

export function formatLongDate(dateKey: string, locale: string): string {
  // dateKey is a local calendar date; format it at UTC noon to avoid shifts.
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

export function formatDuration(minutes: number, locale: string): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  const fr = locale.startsWith('fr');
  if (h && m) return fr ? `${h} h ${String(m).padStart(2, '0')}` : `${h} h ${m} min`;
  if (h) return `${h} h`;
  return `${m} min`;
}

/** Hour in the given timezone (0–23), for greetings. */
export function hourIn(timeZone: string, now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false }).format(now),
  ) % 24;
}

export function shiftDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
