/**
 * Deterministic scheduler. Same input → same output: candidates are scanned in
 * a fixed order and ties are broken by start time, then activity id.
 *
 * Hard constraints (never violated): existing blocks are never moved or
 * overlapped, unavailable time and protected free time are never used, day
 * windows, deadlines, earliest starts, minimum session length, recovery gaps,
 * the daily focus limit, and fixed start times. What can't be placed is
 * returned as unscheduled with a reason and a suggestion — never dropped.
 */
import { addDaysKey, findConflicts, type Interval, localTimeOnDay, mergeIntervals, type PriorityValue } from '@lifeos/shared';
import {
  type Activity,
  DEFAULT_WEIGHTS,
  type EngineInput,
  type EngineResult,
  type Placement,
  type SchedulingWeights,
  type Unscheduled,
  type UnscheduledReason,
} from './types';

const MIN = 60_000;
const STEP = 15 * MIN;
const MAX_CHUNK_MINUTES = 120;
const PRIORITY_RANK: Record<PriorityValue, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, URGENT: 3 };

const TOD_RANGES: Record<string, [number, number]> = {
  MORNING: [6 * 60, 12 * 60],
  AFTERNOON: [12 * 60, 17 * 60],
  EVENING: [17 * 60, 21 * 60],
  NIGHT: [21 * 60, 24 * 60],
};

// ─── Interval helpers ────────────────────────────────────────────────────

function subtract(list: Interval[], block: Interval): Interval[] {
  const out: Interval[] = [];
  for (const i of list) {
    if (block.end <= i.start || block.start >= i.end) {
      out.push(i);
      continue;
    }
    if (block.start > i.start) out.push({ start: i.start, end: block.start });
    if (block.end < i.end) out.push({ start: block.end, end: i.end });
  }
  return out;
}

function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const x of a) {
    for (const y of b) {
      const start = x.start > y.start ? x.start : y.start;
      const end = x.end < y.end ? x.end : y.end;
      if (end > start) out.push({ start, end });
    }
  }
  return out.sort((p, q) => p.start.getTime() - q.start.getTime());
}

function complementWithin(window: Interval, holes: Interval[]): Interval[] {
  return mergeIntervals(holes).reduce((acc, h) => subtract(acc, h), [window]);
}

const minutes = (i: Interval) => (i.end.getTime() - i.start.getTime()) / MIN;
const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;
const ceilStep = (t: number) => Math.ceil(t / STEP) * STEP;

function localMinuteOfDay(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  return Number(parts.find((p) => p.type === 'hour')!.value) * 60 + Number(parts.find((p) => p.type === 'minute')!.value);
}

function dayKeys(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 62; d = addDaysKey(d, 1)) out.push(d);
  return out;
}

const weekday = (key: string) => new Date(`${key}T00:00:00Z`).getUTCDay();

// ─── Engine ──────────────────────────────────────────────────────────────

interface DayState {
  key: string;
  index: number;
  window: Interval;
  free: Interval[];
  work: Interval[];
  preferred: Interval[];
  focusUsed: number;
}

export function schedule(input: EngineInput): EngineResult {
  const tz = input.timezone;
  const prefs = input.preferences;
  const w: SchedulingWeights = { ...DEFAULT_WEIGHTS, ...(prefs.weights ?? {}) };
  const buffer = prefs.bufferMinutes * MIN;
  const keys = dayKeys(input.period.startDate, input.period.endDate);
  const at = (key: string, clock: string) => localTimeOnDay(new Date(`${key}T12:00:00Z`), clock, tz);
  const periodStart = at(keys[0]!, '00:00');
  const periodEnd = at(addDaysKey(keys[keys.length - 1]!, 1), '00:00');
  const now = input.now && input.now > periodStart ? input.now : periodStart;

  // Busy time, padded by the buffer; unavailable time is not padded.
  const hardBlocks: Interval[] = [
    ...input.busy.map((b) => ({ start: new Date(b.start.getTime() - buffer), end: new Date(b.end.getTime() + buffer) })),
    ...input.unavailable.map((u) => ({ start: u.start, end: u.end })),
  ];

  const days: DayState[] = keys.map((key, index) => {
    const wd = weekday(key);
    let start = at(key, prefs.dayStartTime);
    const end = at(key, prefs.dayEndTime);
    if (now > start) start = new Date(Math.min(ceilStep(now.getTime()), end.getTime()));
    const window = { start, end };
    const ruleIntervals = (kind: string) =>
      input.weeklyRules
        .filter((r) => r.kind === kind && r.weekday === wd)
        .map((r) => ({ start: at(key, r.startTime), end: at(key, r.endTime) }));
    const blocked = [...hardBlocks, ...ruleIntervals('UNAVAILABLE'), ...ruleIntervals('PROTECTED_FREE_TIME')];
    const free = window.end > window.start ? complementWithin(window, blocked) : [];
    const workRules = ruleIntervals('WORKING_HOURS');
    const work = workRules.length
      ? mergeIntervals(workRules)
      : prefs.workDays.includes(wd)
        ? [{ start: at(key, prefs.workStartTime), end: at(key, prefs.workEndTime) }]
        : [];
    const dayRange = { start: at(key, '00:00'), end: at(addDaysKey(key, 1), '00:00') };
    const focusUsed = intersect(
      input.busy.filter((b) => b.kind === 'task-block'),
      [dayRange],
    ).reduce((sum, i) => sum + minutes(i), 0);
    return { key, index, window, free, work, preferred: ruleIntervals('PREFERRED'), focusUsed };
  });

  const scheduled: Placement[] = [];
  const unscheduled: Unscheduled[] = [];
  const explanations: string[] = [];
  const priorityScore = (a: Activity) => PRIORITY_RANK[a.priority] / 3;
  const urgencyScore = (a: Activity) => {
    if (!a.deadline) return 0;
    const span = Math.max(1, periodEnd.getTime() - now.getTime());
    return Math.max(0, Math.min(1, 1 - (a.deadline.getTime() - now.getTime()) / span));
  };
  const rank = (a: Activity) => w.priority * priorityScore(a) + w.urgency * urgencyScore(a) + w.goalImportance * (a.goalImportance ?? 0);

  const ordered = [...input.activities].sort(
    (a, b) => Number(!!b.fixedStart) - Number(!!a.fixedStart) || rank(b) - rank(a) || a.id.localeCompare(b.id),
  );

  const reserve = (p: Placement, day: DayState) => {
    for (const d of days) d.free = subtract(d.free, { start: new Date(p.start.getTime() - buffer), end: new Date(p.end.getTime() + buffer) });
    day.focusUsed += minutes(p);
    scheduled.push(p);
  };

  interface Relax {
    ignoreFocus?: boolean;
    ignoreDeadline?: boolean;
  }

  const findSlot = (a: Activity, len: number, index: number, mine: Placement[], relax: Relax = {}) => {
    const tod = a.preferredTimeOfDay && a.preferredTimeOfDay !== 'ANY'
      ? a.preferredTimeOfDay
      : a.kind === 'task' && PRIORITY_RANK[a.priority] >= 2
        ? prefs.preferredFocusTime
        : 'ANY';
    const sessions = a.sessions ?? 1;
    const perDay = sessions > 1 ? Math.max(1, Math.ceil(sessions / days.length)) : Infinity;
    const recovery = (a.recoveryHours ?? 0) * 60 * MIN;
    const spacing = sessions > 1 ? days.length / sessions : 1;
    let best: { start: Date; end: Date; day: DayState; score: number; reasons: string[] } | null = null;

    for (const day of days) {
      if (!relax.ignoreFocus && day.focusUsed + len > prefs.maxDailyFocusMinutes) continue;
      if (mine.filter((m) => m.start >= day.window.start && m.start < at(addDaysKey(day.key, 1), '00:00')).length >= perDay) continue;
      let allowed = day.free;
      if (a.window === 'work') allowed = intersect(allowed, day.work);
      else if (a.window === 'personal') allowed = day.work.reduce((acc, wk) => subtract(acc, wk), allowed);
      for (const iv of allowed) {
        for (let t = ceilStep(iv.start.getTime()); t + len * MIN <= iv.end.getTime(); t += STEP) {
          const start = new Date(t);
          const end = new Date(t + len * MIN);
          if (a.earliest && start < a.earliest) continue;
          if (!relax.ignoreDeadline && a.deadline && end > a.deadline) continue;
          if (recovery && mine.some((m) => start.getTime() < m.end.getTime() + recovery && m.start.getTime() < end.getTime() + recovery)) continue;

          const reasons: string[] = [];
          const minute = localMinuteOfDay(start, tz);
          let fit = 0.6;
          if (tod !== 'ANY') {
            const [lo, hi] = TOD_RANGES[tod]!;
            fit = minute >= lo && minute < hi ? 1 : 0.3;
            if (fit === 1) reasons.push(`In your preferred ${tod.toLowerCase()} time`);
          }
          if (day.preferred.some((p) => start >= p.start && end <= p.end)) {
            fit = Math.min(1, fit + 0.2);
            reasons.push('Inside a preferred window');
          }
          const urgency = a.deadline
            ? Math.max(0, Math.min(1, 1 - (start.getTime() - now.getTime()) / Math.max(1, a.deadline.getTime() - now.getTime())))
            : 1 - day.index / (days.length * 2);
          let continuity = 0.5;
          if (mine.length) {
            const gaps = mine.map((m) => Math.abs(day.index - days.findIndex((d) => m.start >= d.window.start && m.start < at(addDaysKey(d.key, 1), '00:00'))));
            const nearest = Math.min(...gaps);
            continuity = sessions > 1 ? Math.min(1, nearest / Math.max(1, spacing)) : nearest <= 1 ? 1 : 0.4;
          }
          const score =
            (w.timeSlotFit * fit + w.urgency * urgency + w.continuity * continuity) / (w.timeSlotFit + w.urgency + w.continuity);
          if (a.deadline) reasons.push('Before the deadline');
          if (!best || score > best.score + 1e-9) best = { start, end, day, score, reasons };
        }
      }
    }
    return best;
  };

  const explainFailure = (a: Activity, len: number, mine: Placement[]): UnscheduledReason => {
    if (a.deadline && a.deadline <= now) return 'DEADLINE_PASSED';
    if (findSlot(a, len, mine.length, mine, { ignoreFocus: true })) return 'DAILY_FOCUS_LIMIT';
    if (a.deadline && findSlot(a, len, mine.length, mine, { ignoreDeadline: true, ignoreFocus: true })) return 'NO_TIME_BEFORE_DEADLINE';
    return 'NO_FREE_SLOT';
  };

  const SUGGESTION: Record<UnscheduledReason, string> = {
    DEADLINE_PASSED: 'The deadline has passed — set a new one or drop the task.',
    NO_TIME_BEFORE_DEADLINE: 'Not enough free time before the deadline — move the deadline, shorten the task or free up time earlier.',
    DAILY_FOCUS_LIMIT: 'Your daily focus limit is reached on the free days — raise it in Settings or extend the period.',
    FIXED_TIME_TAKEN: 'Its fixed time overlaps something else — pick another time.',
    NO_FREE_SLOT: 'No free slot is long enough — allow splitting, shorten it, or extend the period.',
  };

  for (const a of ordered) {
    const mine: Placement[] = [];
    const sessions = a.sessions ?? 1;
    const requested = a.durationMinutes * sessions;

    if (a.fixedStart) {
      const slot = { start: a.fixedStart, end: new Date(a.fixedStart.getTime() + a.durationMinutes * MIN) };
      const day = days.find((d) => d.free.some((f) => slot.start >= f.start && slot.end <= f.end));
      if (day) {
        reserve({ activityId: a.id, title: a.title, ...slot, index: 0, score: 1, reasons: ['At its fixed time'] }, day);
      } else if (slot.start >= periodStart && slot.start < periodEnd) {
        unscheduled.push({ activityId: a.id, title: a.title, minutesRequested: requested, minutesPlaced: 0, reason: 'FIXED_TIME_TAKEN', suggestion: SUGGESTION.FIXED_TIME_TAKEN });
      }
      continue;
    }

    if (sessions > 1 || !a.splittable) {
      for (let i = 0; i < sessions; i++) {
        const slot = findSlot(a, a.durationMinutes, i, mine);
        if (!slot) break;
        const p = { activityId: a.id, title: a.title, start: slot.start, end: slot.end, index: i, score: slot.score, reasons: slot.reasons };
        reserve(p, slot.day);
        mine.push(p);
      }
    } else {
      let remaining = a.durationMinutes;
      const minChunk = Math.max(15, a.minSessionMinutes ?? prefs.minSessionMinutes);
      // Whole first; otherwise the largest chunk that fits, never below the minimum session.
      while (remaining > 0) {
        let placed = false;
        const first = mine.length === 0 ? [remaining] : [];
        const sizes = [...first];
        for (let len = Math.min(remaining, MAX_CHUNK_MINUTES); len >= Math.min(minChunk, remaining); len -= 15) sizes.push(len);
        for (const len of sizes) {
          if (len < remaining && remaining - len > 0 && remaining - len < minChunk) continue; // don't leave an unplaceable sliver
          const slot = findSlot(a, len, mine.length, mine);
          if (!slot) continue;
          const p = { activityId: a.id, title: a.title, start: slot.start, end: slot.end, index: mine.length, score: slot.score, reasons: slot.reasons };
          reserve(p, slot.day);
          mine.push(p);
          remaining -= len;
          placed = true;
          break;
        }
        if (!placed) break;
      }
    }

    const placedMinutes = mine.reduce((s, p) => s + minutes(p), 0);
    if (placedMinutes < requested) {
      const len = sessions > 1 || !a.splittable ? a.durationMinutes : Math.min(requested - placedMinutes, Math.max(15, a.minSessionMinutes ?? prefs.minSessionMinutes));
      const reason = explainFailure(a, len, mine);
      unscheduled.push({ activityId: a.id, title: a.title, minutesRequested: requested, minutesPlaced: placedMinutes, reason, suggestion: SUGGESTION[reason] });
    }
  }

  scheduled.sort((x, y) => x.start.getTime() - y.start.getTime() || x.activityId.localeCompare(y.activityId));

  const dailyWorkload: Record<string, number> = {};
  for (const d of days) {
    const dayRange = { start: at(d.key, '00:00'), end: at(addDaysKey(d.key, 1), '00:00') };
    const busyMin = mergeIntervals(input.busy.map((b) => ({ start: b.start, end: b.end }))).reduce(
      (s, b) => s + intersect([b], [dayRange]).reduce((x, i) => x + minutes(i), 0),
      0,
    );
    const placedMin = scheduled.filter((p) => overlaps(p, dayRange)).reduce((s, p) => s + minutes(p), 0);
    dailyWorkload[d.key] = Math.round(busyMin + placedMin);
  }

  const totalRequested = input.activities.reduce((s, a) => s + a.durationMinutes * (a.sessions ?? 1), 0);
  const totalPlaced = scheduled.reduce((s, p) => s + minutes(p), 0);
  const avgScore = scheduled.length ? scheduled.reduce((s, p) => s + p.score, 0) / scheduled.length : 0;
  const score = totalRequested ? Math.round((totalPlaced / totalRequested) * avgScore * 1000) / 1000 : 1;

  explanations.push(
    `Placed ${Math.round(totalPlaced)} of ${Math.round(totalRequested)} requested minutes across ${days.length} day(s), without moving any existing event.`,
  );
  if (unscheduled.length) explanations.push(`${unscheduled.length} item(s) couldn’t be placed — see the reasons.`);
  const heavy = Object.entries(dailyWorkload).filter(([, m]) => m > prefs.maxDailyFocusMinutes + 120);
  if (heavy.length) explanations.push(`Heavy day(s): ${heavy.map(([k]) => k).join(', ')}.`);

  const result: EngineResult = {
    scheduled,
    unscheduled,
    conflicts: findConflicts(input.busy.map((b) => ({ id: b.id, start: b.start, end: b.end }))).map((c) => ({ a: c.a, b: c.b, overlapMinutes: c.overlapMinutes })),
    violations: [],
    dailyWorkload,
    freeMinutes: Math.round(days.reduce((s, d) => s + d.free.reduce((x, f) => x + minutes(f), 0), 0)),
    score,
    explanations,
  };
  result.violations = verify(input, result);
  return result;
}

/** Independent check of the hard constraints on a result (used by tests and as a runtime guard). */
export function verify(input: EngineInput, result: EngineResult): string[] {
  const issues: string[] = [];
  const tz = input.timezone;
  const at = (key: string, clock: string) => localTimeOnDay(new Date(`${key}T12:00:00Z`), clock, tz);
  const byId = new Map(input.activities.map((a) => [a.id, a]));
  const placements = result.scheduled;
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!;
    const a = byId.get(p.activityId);
    if (!a) issues.push(`Unknown activity ${p.activityId}`);
    if (p.end <= p.start) issues.push(`${p.title}: empty placement`);
    for (const b of input.busy) if (overlaps(p, b)) issues.push(`${p.title} overlaps ${b.title}`);
    for (const u of input.unavailable) if (overlaps(p, u)) issues.push(`${p.title} is in unavailable time`);
    for (let j = i + 1; j < placements.length; j++) if (overlaps(p, placements[j]!)) issues.push(`${p.title} overlaps ${placements[j]!.title}`);
    if (a?.deadline && p.end > a.deadline) issues.push(`${p.title} ends after its deadline`);
    if (a?.earliest && p.start < a.earliest) issues.push(`${p.title} starts before it may`);
    if (a?.fixedStart && p.start.getTime() !== a.fixedStart.getTime()) issues.push(`${p.title} moved from its fixed time`);
    if (!a?.fixedStart) {
      const key = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(p.start);
      if (p.start < at(key, input.preferences.dayStartTime) || p.end > at(key, input.preferences.dayEndTime)) {
        issues.push(`${p.title} is outside the day window`);
      }
      const wd = weekday(key);
      for (const r of input.weeklyRules) {
        if ((r.kind === 'UNAVAILABLE' || r.kind === 'PROTECTED_FREE_TIME') && r.weekday === wd && overlaps(p, { start: at(key, r.startTime), end: at(key, r.endTime) })) {
          issues.push(`${p.title} uses ${r.kind === 'UNAVAILABLE' ? 'unavailable' : 'protected'} time`);
        }
      }
    }
  }
  return issues;
}
