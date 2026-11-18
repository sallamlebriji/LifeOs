import { describe, expect, it } from 'vitest';
import { sportsStats } from '../sports/sports.module';
import { dueReviews } from '../study/study.module';
import { periodKeys } from './analytics.module';

describe('periodKeys', () => {
  it('computes week and month bounds (end exclusive)', () => {
    expect(periodKeys('week', '2026-11-18', 1)).toEqual({ start: '2026-11-16', end: '2026-11-23' });
    expect(periodKeys('month', '2026-12-31', 1)).toEqual({ start: '2026-12-01', end: '2027-01-01' });
  });
});

describe('sportsStats', () => {
  const now = new Date('2026-11-18T18:00:00Z');
  const w = (iso: string, type: 'STRENGTH' | 'CARDIO' = 'STRENGTH', intensity: number | null = 6) => ({ startAt: new Date(iso), durationMinutes: 60, type, intensity });
  it('counts this week against the target and the week streak', () => {
    const s = sportsStats(
      [
        w('2026-11-16T17:00:00Z'),
        w('2026-11-17T17:00:00Z', 'CARDIO', 9),
        w('2026-11-18T07:00:00Z'),
        w('2026-11-10T17:00:00Z'),
        w('2026-11-11T17:00:00Z'),
        w('2026-11-12T17:00:00Z'),
      ],
      { today: '2026-11-18', timezone: 'UTC', weekStartsOn: 1, target: 3, now },
    );
    expect(s.thisWeek).toEqual({ sessions: 3, minutes: 180 });
    expect(s.weekStreak).toBe(2);
    expect(s.weeks).toHaveLength(8);
    expect(s.minutesByType).toMatchObject({ STRENGTH: 300, CARDIO: 60 });
    expect(s.daysSinceHardSession).toBe(1);
  });
});

describe('dueReviews', () => {
  it('keeps only the latest session per topic and returns those due', () => {
    const base = { subjectId: 's', subjectName: 'Maths' };
    const due = dueReviews(
      [
        { ...base, topic: 'Limits', kind: 'LEARNING', completedAt: new Date('2026-11-10'), nextReviewAt: new Date('2026-11-11'), quality: null },
        { ...base, topic: 'limits ', kind: 'REVISION', completedAt: new Date('2026-11-11'), nextReviewAt: new Date('2026-11-17'), quality: 4 },
        { ...base, topic: 'Series', kind: 'LEARNING', completedAt: new Date('2026-11-17'), nextReviewAt: new Date('2026-11-19'), quality: null },
      ],
      new Date('2026-11-18T23:00:00Z'),
    );
    expect(due).toEqual([{ subjectId: 's', subjectName: 'Maths', topic: 'limits ', dueAt: '2026-11-17T00:00:00.000Z', lastQuality: 4, repetitions: 1 }]);
  });
});
