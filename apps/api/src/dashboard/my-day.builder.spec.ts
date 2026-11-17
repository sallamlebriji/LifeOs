import { localDayRange } from '@lifeos/shared';
import { describe, expect, it } from 'vitest';
import { buildMyDay, computeStreak, type MyDayInput } from './my-day.builder';

// Europe/Paris has stable rules (UTC+1 in November); Casablanca's depend on tzdata version.
const TZ = 'Europe/Paris';
const d = (iso: string) => new Date(iso);

function input(overrides: Partial<MyDayInput> = {}): MyDayInput {
  const now = overrides.now ?? d('2026-11-17T09:00:00Z'); // 10:00 local
  return {
    now,
    date: '2026-11-17',
    isToday: true,
    timezone: TZ,
    displayName: 'Sallam',
    dayRange: localDayRange(d('2026-11-17T12:00:00Z'), TZ),
    dayStartTime: '07:00',
    dayEndTime: '22:00',
    minSessionMinutes: 25,
    maxDailyFocusMinutes: 480,
    events: [],
    taskBlocks: [],
    tasks: [],
    habits: [],
    goals: [],
    ...overrides,
  };
}

const task = (over: Partial<MyDayInput['tasks'][number]>): MyDayInput['tasks'][number] => ({
  id: over.id ?? 't',
  title: over.title ?? 'Task',
  status: 'TODO',
  priority: 'MEDIUM',
  estimatedMinutes: null,
  dueAt: null,
  completedAt: null,
  category: null,
  project: null,
  ...over,
});

describe('buildMyDay', () => {
  it('returns honest empty state for a new user', () => {
    const day = buildMyDay(input());
    expect(day.agenda).toEqual([]);
    expect(day.topPriority).toBeNull();
    expect(day.nextUp).toBeNull();
    expect(day.insights).toEqual([]);
    // From now (10:00) until 22:00 local = 12 h free.
    expect(day.stats.freeMinutes).toBe(720);
  });

  it('computes the local day window in the user timezone', () => {
    const day = buildMyDay(input({ isToday: false, now: d('2026-11-16T09:00:00Z') }));
    expect(day.dayWindow.start).toBe('2026-11-17T06:00:00.000Z'); // 07:00 local
    expect(day.dayWindow.end).toBe('2026-11-17T21:00:00.000Z'); // 22:00 local
    expect(day.stats.freeMinutes).toBe(15 * 60);
  });

  it('subtracts events from free time and drops slots shorter than the minimum session', () => {
    const day = buildMyDay(
      input({
        events: [
          {
            id: 'e1',
            title: 'Stand-up',
            startAt: d('2026-11-17T09:10:00Z'), // 10:10–10:30 local
            endAt: d('2026-11-17T09:30:00Z'),
            allDay: false,
            location: null,
            locked: true,
            flexibility: 'FIXED',
            priority: 'MEDIUM',
            category: null,
          },
        ],
      }),
    );
    // 10:00–10:10 (10 min) is below the 25-min minimum and is dropped.
    expect(day.freeSlots[0]!.start).toBe('2026-11-17T09:30:00.000Z');
    expect(day.stats.freeMinutes).toBe(690);
    expect(day.stats.scheduledMinutes).toBe(20);
    expect(day.nextUp?.id).toBe('e1');
    expect(day.agenda[0]!.locked).toBe(true);
  });

  it('orders tasks: overdue first, then priority; completed last', () => {
    const day = buildMyDay(
      input({
        tasks: [
          task({ id: 'low', priority: 'LOW' }),
          task({ id: 'done', priority: 'URGENT', status: 'COMPLETED', completedAt: d('2026-11-17T08:00:00Z') }),
          task({ id: 'high', priority: 'HIGH' }),
          task({ id: 'overdue', priority: 'LOW', dueAt: d('2026-11-16T10:00:00Z') }),
        ],
      }),
    );
    expect(day.tasks.map((t) => t.id)).toEqual(['overdue', 'high', 'low', 'done']);
    expect(day.topPriority?.id).toBe('overdue');
    expect(day.stats.overdueCount).toBe(1);
    expect(day.stats.tasksCompleted).toBe(1);
    expect(day.insights.some((i) => i.id === 'overdue')).toBe(true);
  });

  it('warns when open task estimates exceed remaining free time', () => {
    const day = buildMyDay(
      input({
        now: d('2026-11-17T19:00:00Z'), // 20:00 local → 2 h left
        tasks: [task({ id: 'big', estimatedMinutes: 300 })],
      }),
    );
    expect(day.stats.freeMinutes).toBe(120);
    expect(day.insights.find((i) => i.id === 'overcommitted')).toBeDefined();
  });

  it('suggests a free slot that fits the top-priority task', () => {
    const day = buildMyDay(input({ tasks: [task({ title: 'Write report', estimatedMinutes: 60, priority: 'URGENT' })] }));
    const hint = day.insights.find((i) => i.id === 'focus-slot');
    expect(hint?.detail).toContain('10:00');
  });

  it('has no free time once the day window has passed', () => {
    const day = buildMyDay(input({ now: d('2026-11-17T22:30:00Z') }));
    expect(day.freeSlots).toEqual([]);
  });

  it('computes goal progress clamped to [0, 1]', () => {
    const day = buildMyDay(
      input({
        goals: [
          { id: 'g', title: 'Run 100 km', level: 'MONTHLY', targetValue: 100, currentValue: 140, deadline: null },
          { id: 'h', title: 'No target', level: 'WEEKLY', targetValue: null, currentValue: 0, deadline: null },
        ],
      }),
    );
    expect(day.goals[0]!.progress).toBe(1);
    expect(day.goals[1]!.progress).toBeNull();
  });
});

describe('computeStreak', () => {
  it('counts consecutive days including today', () => {
    expect(computeStreak(['2026-11-17', '2026-11-16', '2026-11-15', '2026-11-13'], '2026-11-17')).toBe(3);
  });
  it('keeps yesterday’s streak alive when today is not done yet', () => {
    expect(computeStreak(['2026-11-16', '2026-11-15'], '2026-11-17')).toBe(2);
  });
  it('is zero when the chain is broken', () => {
    expect(computeStreak(['2026-11-14'], '2026-11-17')).toBe(0);
  });
});
