import { describe, expect, it } from 'vitest';
import { fromZonedInput, layoutDay, segmentsFor, shiftAnchor, toZonedInput, viewRange, zonedInstant, zonedParts } from './calendar-model';

const TZ = 'Europe/Paris';

describe('calendar timezone maths', () => {
  it('converts between instants and local wall time in the preference timezone', () => {
    expect(zonedParts('2026-11-18T08:30:00Z', TZ)).toEqual({ dateKey: '2026-11-18', minutes: 9 * 60 + 30 });
    expect(zonedInstant('2026-11-18', 9 * 60 + 30, TZ).toISOString()).toBe('2026-11-18T08:30:00.000Z');
    expect(zonedInstant('2026-11-18', 1440, TZ).toISOString()).toBe('2026-11-18T23:00:00.000Z'); // next midnight
    expect(toZonedInput('2026-11-18T08:30:00Z', TZ)).toBe('2026-11-18T09:30');
    expect(fromZonedInput('2026-11-18T09:30', TZ)).toBe('2026-11-18T08:30:00.000Z');
    expect(fromZonedInput('nope', TZ)).toBeNull();
  });

  it('computes week and month ranges from the week start preference', () => {
    const week = viewRange('week', '2026-11-18', 1, TZ);
    expect(week.days[0]).toBe('2026-11-16');
    expect(week.days).toHaveLength(7);
    expect(week.from).toBe('2026-11-15T23:00:00.000Z');
    const month = viewRange('month', '2026-11-18', 1, TZ);
    expect(month.days[0]).toBe('2026-10-26');
    expect(month.days).toHaveLength(42);
    expect(shiftAnchor('month', '2026-01-31', 1)).toBe('2026-02-01');
  });

  it('splits multi-day events per day', () => {
    expect(segmentsFor('2026-11-17T21:00:00Z', '2026-11-18T07:00:00Z', ['2026-11-17', '2026-11-18'], TZ)).toEqual([
      { dateKey: '2026-11-17', start: 22 * 60, end: 1440 },
      { dateKey: '2026-11-18', start: 0, end: 8 * 60 },
    ]);
  });
});

describe('layoutDay', () => {
  it('places overlapping events side by side and reuses free columns', () => {
    const out = layoutDay([
      { item: 'a', start: 540, end: 600 },
      { item: 'b', start: 570, end: 630 },
      { item: 'c', start: 600, end: 660 }, // a has ended: reuses column 0
      { item: 'd', start: 720, end: 780 }, // separate cluster
    ]);
    const by = Object.fromEntries(out.map((p) => [p.item, p]));
    expect([by.a!.col, by.b!.col, by.c!.col]).toEqual([0, 1, 0]);
    expect(by.a!.cols).toBe(2);
    expect(by.d).toMatchObject({ col: 0, cols: 1 });
  });
});
