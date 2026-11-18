import { TZDate } from '@date-fns/tz';
import { RRule } from 'rrule';
import { type UtcRange } from './time';

/**
 * Recurrence (RFC 5545 RRULE) helpers.
 *
 * Rules are stored without DTSTART (e.g. "FREQ=WEEKLY;BYDAY=MO,WE"); the anchor is
 * the event's own start. Expansion happens in *wall-clock* time of the event's
 * timezone so a 09:00 weekly meeting stays at 09:00 across DST changes, then each
 * occurrence is converted back to a UTC instant.
 */

export const MAX_RRULE_LENGTH = 500;
const ALLOWED_KEYS = new Set([
  'FREQ',
  'INTERVAL',
  'COUNT',
  'UNTIL',
  'BYDAY',
  'BYMONTHDAY',
  'BYMONTH',
  'BYSETPOS',
  'WKST',
]);
const FREQS = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']);

/** Returns null when valid, otherwise a human-readable reason. */
export function rruleProblem(rule: string): string | null {
  if (rule.length === 0 || rule.length > MAX_RRULE_LENGTH) return 'Recurrence rule is empty or too long';
  const parts = rule.replace(/^RRULE:/i, '').split(';');
  const seen = new Set<string>();
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (!key || !value) return `Malformed recurrence part "${part}"`;
    const k = key.toUpperCase();
    if (!ALLOWED_KEYS.has(k)) return `Unsupported recurrence property ${k}`;
    if (seen.has(k)) return `Duplicate recurrence property ${k}`;
    seen.add(k);
    if (k === 'FREQ' && !FREQS.has(value.toUpperCase())) return 'FREQ must be DAILY, WEEKLY, MONTHLY or YEARLY';
    if (k === 'INTERVAL' && !(Number(value) >= 1 && Number(value) <= 366)) return 'INTERVAL must be 1–366';
    if (k === 'COUNT' && !(Number(value) >= 1 && Number(value) <= 1000)) return 'COUNT must be 1–1000';
  }
  if (!seen.has('FREQ')) return 'Recurrence rule needs FREQ';
  if (seen.has('COUNT') && seen.has('UNTIL')) return 'Use COUNT or UNTIL, not both';
  try {
    RRule.parseString(rule.replace(/^RRULE:/i, ''));
  } catch {
    return 'Recurrence rule could not be parsed';
  }
  return null;
}

/** Wall-clock components of `instant` in `timeZone`, encoded as a "floating" UTC Date. */
function toFloating(instant: Date, timeZone: string): Date {
  const z = new TZDate(instant.getTime(), timeZone);
  return new Date(
    Date.UTC(z.getFullYear(), z.getMonth(), z.getDate(), z.getHours(), z.getMinutes(), z.getSeconds()),
  );
}

function fromFloating(floating: Date, timeZone: string): Date {
  const z = new TZDate(
    floating.getUTCFullYear(),
    floating.getUTCMonth(),
    floating.getUTCDate(),
    floating.getUTCHours(),
    floating.getUTCMinutes(),
    floating.getUTCSeconds(),
    timeZone,
  );
  return new Date(z.getTime());
}

function buildRule(rule: string, dtstart: Date): RRule {
  const options = RRule.parseString(rule.replace(/^RRULE:/i, ''));
  return new RRule({ ...options, dtstart, tzid: null });
}

export interface Occurrence {
  start: Date;
  end: Date;
  /** 0 for the series anchor itself. */
  index: number;
}

/**
 * Occurrences of a recurring series overlapping `range`.
 * `max` bounds the work for pathological rules (e.g. a daily rule over years).
 */
export function expandRecurrence(args: {
  rule: string;
  start: Date;
  end: Date;
  timeZone: string;
  range: UtcRange;
  max?: number;
}): Occurrence[] {
  const { rule, start, end, timeZone, range, max = 500 } = args;
  const durationMs = end.getTime() - start.getTime();
  const anchor = toFloating(start, timeZone);
  const rrule = buildRule(rule, anchor);
  // Floating time is offset from real time by at most ±14h; widen the window by a day.
  const day = 86_400_000;
  const from = new Date(toFloating(new Date(range.start.getTime() - durationMs), timeZone).getTime() - day);
  const to = new Date(toFloating(range.end, timeZone).getTime() + day);
  const all = rrule.all((date, i) => i < 5000 && date <= to);
  const out: Occurrence[] = [];
  all.forEach((floating, index) => {
    if (floating < from || out.length >= max) return;
    const occStart = fromFloating(floating, timeZone);
    const occEnd = new Date(occStart.getTime() + durationMs);
    if (occStart < range.end && occEnd > range.start) out.push({ start: occStart, end: occEnd, index });
  });
  return out;
}

/**
 * Next calendar date (YYYY-MM-DD) strictly after `afterDate` for a date-based
 * series anchored on `anchorDate`. Used to roll recurring tasks forward.
 */
export function nextRecurrenceDate(rule: string, anchorDate: string, afterDate: string): string | null {
  const anchor = new Date(`${anchorDate}T00:00:00Z`);
  const after = new Date(`${afterDate}T00:00:00Z`);
  const next = buildRule(rule, anchor).after(after, false);
  return next ? next.toISOString().slice(0, 10) : null;
}
