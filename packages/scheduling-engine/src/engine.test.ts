import { describe, expect, it } from 'vitest';
import { schedule, verify } from './engine';
import { type Activity, type EngineInput } from './types';

const TZ = 'Europe/Paris';
const prefs: EngineInput['preferences'] = {
  dayStartTime: '08:00',
  dayEndTime: '20:00',
  workStartTime: '09:00',
  workEndTime: '17:00',
  workDays: [1, 2, 3, 4, 5],
  bufferMinutes: 10,
  minSessionMinutes: 30,
  maxDailyFocusMinutes: 480,
  preferredFocusTime: 'MORNING',
};
// Paris is UTC+1 in late November.
const paris = (day: string, hh: number, mm = 0) => new Date(Date.UTC(2026, 10, Number(day), hh - 1, mm));

function base(overrides: Partial<EngineInput> = {}): EngineInput {
  return {
    period: { startDate: '2026-11-23', endDate: '2026-11-27' }, // Mon–Fri
    timezone: TZ,
    preferences: prefs,
    busy: [],
    unavailable: [],
    weeklyRules: [],
    activities: [],
    ...overrides,
  };
}

const task = (id: string, extra: Partial<Activity> = {}): Activity => ({
  id,
  title: id,
  kind: 'task',
  durationMinutes: 60,
  priority: 'MEDIUM',
  ...extra,
});

describe('schedule', () => {
  it('places a high-priority task in the preferred morning, clear of busy time and its buffer', () => {
    const r = schedule(
      base({
        period: { startDate: '2026-11-23', endDate: '2026-11-23' },
        busy: [{ id: 'standup', title: 'Stand-up', start: paris('23', 8), end: paris('23', 9), locked: true, kind: 'event' }],
        activities: [task('report', { priority: 'HIGH' })],
      }),
    );
    expect(r.unscheduled).toEqual([]);
    expect(r.scheduled).toHaveLength(1);
    // Stand-up ends 09:00 + 10 min buffer → 09:15 is the first 15-min step.
    expect(r.scheduled[0]!.start.toISOString()).toBe(paris('23', 9, 15).toISOString());
    expect(r.scheduled[0]!.reasons).toContain('In your preferred morning time');
    expect(r.violations).toEqual([]);
  });

  it('never moves or overlaps locked events and never uses unavailable or protected time', () => {
    const r = schedule(
      base({
        period: { startDate: '2026-11-23', endDate: '2026-11-23' },
        busy: [{ id: 'exam', title: 'Exam', start: paris('23', 8), end: paris('23', 12), locked: true, kind: 'event' }],
        unavailable: [{ start: paris('23', 12), end: paris('23', 14) }],
        weeklyRules: [{ kind: 'PROTECTED_FREE_TIME', weekday: 1, startTime: '18:00', endTime: '20:00' }],
        activities: [task('a', { durationMinutes: 120 }), task('b', { durationMinutes: 120 })],
      }),
    );
    for (const p of r.scheduled) {
      expect(p.start >= paris('23', 14)).toBe(true);
      expect(p.end <= paris('23', 18)).toBe(true);
    }
    expect(r.violations).toEqual([]);
  });

  it('splits a splittable task into sessions no shorter than the minimum', () => {
    const busy = [10, 12, 14, 16, 18].map((h, i) => ({
      id: `m${i}`,
      title: 'Meeting',
      start: paris('23', h),
      end: paris('23', h + 1),
      locked: false,
      kind: 'event' as const,
    }));
    const r = schedule(
      base({
        period: { startDate: '2026-11-23', endDate: '2026-11-23' },
        preferences: { ...prefs, bufferMinutes: 0 },
        busy,
        activities: [task('essay', { durationMinutes: 180, splittable: true, minSessionMinutes: 45 })],
      }),
    );
    expect(r.unscheduled).toEqual([]);
    expect(r.scheduled.length).toBeGreaterThan(1);
    expect(r.scheduled.every((p) => (p.end.getTime() - p.start.getTime()) / 60_000 >= 45)).toBe(true);
    expect(r.scheduled.reduce((s, p) => s + (p.end.getTime() - p.start.getTime()) / 60_000, 0)).toBe(180);
  });

  it('spaces repeated workouts by their recovery time', () => {
    const r = schedule(
      base({
        period: { startDate: '2026-11-23', endDate: '2026-11-29' },
        activities: [{ id: 'gym', title: 'Gym', kind: 'activity', durationMinutes: 60, sessions: 3, recoveryHours: 36, priority: 'MEDIUM', preferredTimeOfDay: 'EVENING', window: 'personal' }],
      }),
    );
    expect(r.scheduled).toHaveLength(3);
    const starts = r.scheduled.map((p) => p.start.getTime());
    for (let i = 1; i < starts.length; i++) expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(36 * 3_600_000);
    expect(r.scheduled.every((p) => p.reasons.includes('In your preferred evening time'))).toBe(true);
  });

  it('keeps work tasks inside working hours', () => {
    const r = schedule(base({ period: { startDate: '2026-11-28', endDate: '2026-11-30' }, activities: [task('w', { window: 'work' })] }));
    // 28–29 Nov is a weekend: the first working slot is Monday 30th 09:00.
    expect(r.scheduled[0]!.start.toISOString()).toBe(paris('30', 9).toISOString());
  });

  it('explains why something could not be placed', () => {
    const r = schedule(
      base({
        period: { startDate: '2026-11-23', endDate: '2026-11-24' },
        now: paris('23', 8),
        preferences: { ...prefs, maxDailyFocusMinutes: 120 },
        busy: [{ id: 'x', title: 'Busy', start: paris('23', 8), end: paris('23', 19), locked: true, kind: 'event' }],
        activities: [
          task('late', { deadline: paris('23', 20) }),
          task('past', { deadline: paris('20', 12) }),
          task('big', { durationMinutes: 180 }),
          task('fixed', { fixedStart: paris('23', 10) }),
        ],
      }),
    );
    const reasons = Object.fromEntries(r.unscheduled.map((u) => [u.activityId, u.reason]));
    expect(reasons).toEqual({
      late: 'NO_TIME_BEFORE_DEADLINE',
      past: 'DEADLINE_PASSED',
      big: 'DAILY_FOCUS_LIMIT',
      fixed: 'FIXED_TIME_TAKEN',
    });
    expect(r.unscheduled.every((u) => u.suggestion.length > 0)).toBe(true);
  });

  it('handles the autumn DST change (25-hour day)', () => {
    const r = schedule(
      base({
        period: { startDate: '2026-10-25', endDate: '2026-10-25' },
        activities: [task('sunday', { preferredTimeOfDay: 'MORNING' })],
      }),
    );
    // 08:00 Paris on 25 Oct (after the switch, UTC+1) is 07:00Z.
    expect(r.scheduled[0]!.start.toISOString()).toBe('2026-10-25T07:00:00.000Z');
  });

  it('is deterministic regardless of input order', () => {
    const activities = ['c', 'a', 'b', 'd'].map((id, i) => task(id, { priority: i % 2 ? 'HIGH' : 'LOW', durationMinutes: 45 + i * 15 }));
    const one = schedule(base({ activities }));
    const two = schedule(base({ activities: [...activities].reverse() }));
    expect(JSON.stringify(two)).toBe(JSON.stringify(one));
  });
});

/** Small seeded PRNG so the property test is reproducible. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('schedule (property-style)', () => {
  it('never violates hard constraints and accounts for every minute', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const rnd = mulberry32(seed);
      const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!;
      const busy = Array.from({ length: Math.floor(rnd() * 8) }, (_, i) => {
        const day = String(23 + Math.floor(rnd() * 5));
        const h = 8 + Math.floor(rnd() * 10);
        return { id: `b${i}`, title: `b${i}`, start: paris(day, h), end: paris(day, h + 1 + Math.floor(rnd() * 3)), locked: rnd() > 0.5, kind: pick(['event', 'task-block'] as const) };
      });
      const activities: Activity[] = Array.from({ length: 1 + Math.floor(rnd() * 7) }, (_, i) => ({
        id: `a${i}`,
        title: `a${i}`,
        kind: rnd() > 0.7 ? 'activity' : 'task',
        durationMinutes: 15 * (1 + Math.floor(rnd() * 12)),
        sessions: rnd() > 0.7 ? 1 + Math.floor(rnd() * 3) : 1,
        splittable: rnd() > 0.5,
        priority: pick(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const),
        deadline: rnd() > 0.6 ? paris(String(23 + Math.floor(rnd() * 5)), 8 + Math.floor(rnd() * 12)) : null,
        preferredTimeOfDay: pick(['ANY', 'MORNING', 'AFTERNOON', 'EVENING'] as const),
        window: pick(['any', 'work', 'personal'] as const),
        recoveryHours: rnd() > 0.8 ? 24 : 0,
      }));
      const input = base({
        busy,
        activities,
        unavailable: rnd() > 0.5 ? [{ start: paris('24', 12), end: paris('24', 15) }] : [],
        weeklyRules: rnd() > 0.5 ? [{ kind: 'PROTECTED_FREE_TIME', weekday: 3, startTime: '17:00', endTime: '20:00' }] : [],
        preferences: { ...prefs, maxDailyFocusMinutes: 60 * (2 + Math.floor(rnd() * 6)) },
      });
      const r = schedule(input);
      expect(verify(input, r), `seed ${seed}`).toEqual([]);
      for (const a of activities) {
        const placed = r.scheduled.filter((p) => p.activityId === a.id).reduce((s, p) => s + (p.end.getTime() - p.start.getTime()) / 60_000, 0);
        const requested = a.durationMinutes * (a.sessions ?? 1);
        const missing = r.unscheduled.find((u) => u.activityId === a.id);
        if (placed < requested) expect(missing, `seed ${seed} ${a.id}`).toBeDefined();
        else expect(missing).toBeUndefined();
      }
    }
  }, 60_000);
});
