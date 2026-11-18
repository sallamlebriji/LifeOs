import { describe, expect, it } from 'vitest';
import { findConflicts, overlapping } from './conflicts';
import { expandRecurrence, nextRecurrenceDate, rruleProblem } from './recurrence';

const TZ = 'Europe/Paris';

describe('rruleProblem', () => {
  it('accepts common rules', () => {
    expect(rruleProblem('FREQ=DAILY')).toBeNull();
    expect(rruleProblem('FREQ=WEEKLY;BYDAY=MO,WE,FR')).toBeNull();
    expect(rruleProblem('FREQ=MONTHLY;BYMONTHDAY=15;COUNT=6')).toBeNull();
  });
  it('rejects malformed, unsupported or ambiguous rules', () => {
    expect(rruleProblem('BYDAY=MO')).toMatch(/FREQ/);
    expect(rruleProblem('FREQ=HOURLY')).toMatch(/FREQ/);
    expect(rruleProblem('FREQ=DAILY;DTSTART=20260101')).toMatch(/Unsupported/);
    expect(rruleProblem('FREQ=DAILY;COUNT=3;UNTIL=20270101T000000Z')).toMatch(/COUNT or UNTIL/);
    expect(rruleProblem('FREQ=DAILY;INTERVAL=0')).toMatch(/INTERVAL/);
  });
});

describe('expandRecurrence', () => {
  it('keeps wall-clock time across a DST change', () => {
    // Weekly Monday 09:00 Paris, spanning the 2026-10-25 switch to winter time.
    const occ = expandRecurrence({
      rule: 'FREQ=WEEKLY;BYDAY=MO',
      start: new Date('2026-10-19T07:00:00Z'), // 09:00 CEST
      end: new Date('2026-10-19T08:00:00Z'),
      timeZone: TZ,
      range: { start: new Date('2026-10-18T00:00:00Z'), end: new Date('2026-11-03T00:00:00Z') },
    });
    expect(occ.map((o) => o.start.toISOString())).toEqual([
      '2026-10-19T07:00:00.000Z',
      '2026-10-26T08:00:00.000Z', // 09:00 CET
      '2026-11-02T08:00:00.000Z',
    ]);
    expect(occ.every((o) => o.end.getTime() - o.start.getTime() === 3_600_000)).toBe(true);
  });

  it('includes an occurrence that started before the range but overlaps it', () => {
    const occ = expandRecurrence({
      rule: 'FREQ=DAILY',
      start: new Date('2026-11-01T22:00:00Z'),
      end: new Date('2026-11-02T01:00:00Z'),
      timeZone: TZ,
      range: { start: new Date('2026-11-05T00:00:00Z'), end: new Date('2026-11-05T12:00:00Z') },
    });
    expect(occ.map((o) => o.start.toISOString())).toEqual([
      '2026-11-04T22:00:00.000Z',
      // 2026-11-05T22:00Z starts after the range end and is excluded.
    ]);
  });

  it('honours COUNT and caps output', () => {
    const occ = expandRecurrence({
      rule: 'FREQ=DAILY;COUNT=3',
      start: new Date('2026-11-01T08:00:00Z'),
      end: new Date('2026-11-01T09:00:00Z'),
      timeZone: TZ,
      range: { start: new Date('2026-10-01T00:00:00Z'), end: new Date('2027-01-01T00:00:00Z') },
    });
    expect(occ).toHaveLength(3);
    expect(occ.map((o) => o.index)).toEqual([0, 1, 2]);
  });
});

describe('nextRecurrenceDate', () => {
  it('rolls a weekday rule forward', () => {
    // 2026-11-20 is a Friday → next weekday is Monday 23rd.
    expect(nextRecurrenceDate('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', '2026-11-16', '2026-11-20')).toBe('2026-11-23');
  });
  it('returns null when the series has ended', () => {
    expect(nextRecurrenceDate('FREQ=DAILY;COUNT=2', '2026-11-16', '2026-11-17')).toBeNull();
  });
});

describe('findConflicts', () => {
  const at = (h: number, m = 0) => new Date(Date.UTC(2026, 10, 17, h, m));
  it('reports overlapping pairs only', () => {
    const conflicts = findConflicts([
      { id: 'a', start: at(9), end: at(10) },
      { id: 'b', start: at(9, 30), end: at(11) },
      { id: 'c', start: at(11), end: at(12) }, // touches b, no overlap
      { id: 'd', start: at(9, 45), end: at(9, 50) },
    ]);
    expect(conflicts.map((c) => [c.a, c.b, c.overlapMinutes])).toEqual([
      ['a', 'b', 30],
      ['a', 'd', 5],
      ['b', 'd', 5],
    ]);
  });
  it('finds what overlaps a candidate', () => {
    const items = [
      { id: 'x', start: at(8), end: at(9) },
      { id: 'y', start: at(10), end: at(11) },
    ];
    expect(overlapping({ id: 'n', start: at(8, 30), end: at(10, 15) }, items).map((i) => i.id)).toEqual(['x', 'y']);
  });
});
