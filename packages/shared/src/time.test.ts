import { describe, expect, it } from 'vitest';
import { freeIntervals, mergeIntervals, totalMinutes } from './intervals';
import { localDateKey, localDayRange, localTimeOnDay, parseClock } from './time';

const d = (iso: string) => new Date(iso);

describe('time helpers', () => {
  it('parses HH:mm clocks and rejects invalid ones', () => {
    expect(parseClock('00:00')).toBe(0);
    expect(parseClock('23:59')).toBe(1439);
    expect(() => parseClock('24:00')).toThrow();
    expect(() => parseClock('7:00')).toThrow();
  });

  // Offset-specific assertions use Europe/Paris (stable rules: UTC+1 in November);
  // Africa/Casablanca's rules changed in 2026 and depend on the runtime's tzdata.
  it('computes the local day range in the user timezone', () => {
    const range = localDayRange(d('2026-11-17T10:00:00Z'), 'Europe/Paris');
    expect(range.start.toISOString()).toBe('2026-11-16T23:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-11-17T23:00:00.000Z');
  });

  it('handles a 23-hour DST day (Europe/Paris spring forward)', () => {
    const range = localDayRange(d('2026-03-29T12:00:00Z'), 'Europe/Paris');
    expect((range.end.getTime() - range.start.getTime()) / 3_600_000).toBe(23);
  });

  it('maps an instant near midnight to the correct local date', () => {
    expect(localDateKey(d('2026-11-16T23:30:00Z'), 'Europe/Paris')).toBe('2026-11-17');
    expect(localDateKey(d('2026-11-16T23:30:00Z'), 'UTC')).toBe('2026-11-16');
  });

  it('builds a UTC instant from a local wall-clock time', () => {
    const at = localTimeOnDay(d('2026-11-17T10:00:00Z'), '09:30', 'Europe/Paris');
    expect(at.toISOString()).toBe('2026-11-17T08:30:00.000Z');
  });
});

describe('interval helpers', () => {
  it('merges overlapping and adjacent intervals', () => {
    const merged = mergeIntervals([
      { start: d('2026-01-01T10:00Z'), end: d('2026-01-01T11:00Z') },
      { start: d('2026-01-01T09:00Z'), end: d('2026-01-01T10:00Z') },
      { start: d('2026-01-01T12:00Z'), end: d('2026-01-01T13:00Z') },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.start.toISOString()).toBe('2026-01-01T09:00:00.000Z');
    expect(merged[0]!.end.toISOString()).toBe('2026-01-01T11:00:00.000Z');
  });

  it('returns free gaps within a window, clipping busy blocks', () => {
    const free = freeIntervals({ start: d('2026-01-01T08:00Z'), end: d('2026-01-01T18:00Z') }, [
      { start: d('2026-01-01T07:00Z'), end: d('2026-01-01T09:00Z') },
      { start: d('2026-01-01T12:00Z'), end: d('2026-01-01T13:30Z') },
    ]);
    expect(free.map((f) => [f.start.toISOString(), f.end.toISOString()])).toEqual([
      ['2026-01-01T09:00:00.000Z', '2026-01-01T12:00:00.000Z'],
      ['2026-01-01T13:30:00.000Z', '2026-01-01T18:00:00.000Z'],
    ]);
    expect(totalMinutes(free)).toBe(450);
  });
});
