import { describe, expect, it } from 'vitest';
import { habitStats, isHabitDue, startOfWeekKey } from './habits';

const daily = { frequency: 'DAILY' as const, daysOfWeek: null, timesPerWeek: null };
// 2026-11-18 is a Wednesday.
const TODAY = '2026-11-18';

describe('habit schedule', () => {
  it('computes week starts and due days', () => {
    expect(startOfWeekKey(TODAY, 1)).toBe('2026-11-16');
    expect(startOfWeekKey(TODAY, 0)).toBe('2026-11-15');
    const mwf = { frequency: 'WEEKLY' as const, daysOfWeek: [1, 3, 5], timesPerWeek: null };
    expect(isHabitDue(mwf, '2026-11-18')).toBe(true);
    expect(isHabitDue(mwf, '2026-11-17')).toBe(false);
  });
});

describe('habitStats (day-based)', () => {
  it('counts a streak without penalising an unfinished today', () => {
    const s = habitStats({
      schedule: daily,
      completedDates: ['2026-11-15', '2026-11-16', '2026-11-17'],
      today: TODAY,
      weekStartsOn: 1,
    });
    expect(s.currentStreak).toBe(3);
    expect(s.streakUnit).toBe('days');
    expect(s.consistency28).toBe(1);
    expect(s.completedThisWeek).toBe(2);
    expect(s.dueThisWeek).toBe(7);
  });

  it('skips days the habit is not due', () => {
    const mwf = { frequency: 'WEEKLY' as const, daysOfWeek: [1, 3, 5], timesPerWeek: null };
    const s = habitStats({
      schedule: mwf,
      completedDates: ['2026-11-11', '2026-11-13', '2026-11-16', '2026-11-18'],
      today: TODAY,
      weekStartsOn: 1,
    });
    expect(s.currentStreak).toBe(4);
    expect(s.longestStreak).toBe(4);
    expect(s.dueThisWeek).toBe(3);
  });

  it('breaks the streak on a missed due day and tracks the longest run', () => {
    const s = habitStats({
      schedule: daily,
      completedDates: ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-17', '2026-11-18'],
      today: TODAY,
      weekStartsOn: 1,
    });
    expect(s.currentStreak).toBe(2);
    expect(s.longestStreak).toBe(4);
    expect(s.consistency28).toBeCloseTo(6 / 9, 2); // created-on unknown → from first completion
  });
});

describe('habitStats (N times a week)', () => {
  it('counts week streaks against the quota', () => {
    const s = habitStats({
      schedule: { frequency: 'CUSTOM', daysOfWeek: null, timesPerWeek: 2 },
      completedDates: ['2026-11-02', '2026-11-05', '2026-11-09', '2026-11-12', '2026-11-16'],
      today: TODAY,
      weekStartsOn: 1,
    });
    expect(s.streakUnit).toBe('weeks');
    expect(s.currentStreak).toBe(2); // this week (1/2) doesn't count yet nor break it
    expect(s.completedThisWeek).toBe(1);
    expect(s.dueThisWeek).toBe(2);
    expect(s.consistency28).toBe(0.5); // weeks: 0,0,2,2 of 2 → 4/8
  });
});
