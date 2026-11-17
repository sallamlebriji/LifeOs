import { type MyDayEvent } from '@lifeos/shared';
import { buildRibbon } from './ribbon-model';

const window = { start: '2026-11-17T06:00:00.000Z', end: '2026-11-17T21:00:00.000Z' }; // 07–22 local

function event(id: string, start: string, end: string, extra: Partial<MyDayEvent> = {}): MyDayEvent {
  return {
    id,
    title: id,
    startAt: start,
    endAt: end,
    allDay: false,
    location: null,
    locked: false,
    flexible: false,
    priority: 'MEDIUM',
    category: null,
    kind: 'event',
    ...extra,
  };
}

describe('buildRibbon', () => {
  it('projects events as percentages of the day window', () => {
    const m = buildRibbon(window, [event('a', '2026-11-17T09:00:00Z', '2026-11-17T10:30:00Z')], new Date('2026-11-17T08:00:00Z'), true);
    expect(m.segments).toHaveLength(1);
    expect(m.segments[0]!.left).toBeCloseTo(20); // 3h of 15h
    expect(m.segments[0]!.width).toBeCloseTo(10); // 1.5h of 15h
    expect(m.now).toBeCloseTo((2 / 15) * 100);
  });

  it('clips events that start before or end after the window, and skips all-day events', () => {
    const m = buildRibbon(
      window,
      [
        event('early', '2026-11-17T05:00:00Z', '2026-11-17T07:00:00Z'),
        event('allday', '2026-11-16T23:00:00Z', '2026-11-17T23:00:00Z', { allDay: true }),
        event('outside', '2026-11-17T22:00:00Z', '2026-11-17T23:00:00Z'),
      ],
      new Date('2026-11-17T08:00:00Z'),
      true,
    );
    expect(m.segments.map((s) => s.id)).toEqual(['early']);
    expect(m.segments[0]!.left).toBe(0);
    expect(m.segments[0]!.width).toBeCloseTo((1 / 15) * 100);
  });

  it('hides the now marker on other days and marks past segments only today', () => {
    const e = [event('a', '2026-11-17T06:00:00Z', '2026-11-17T07:00:00Z')];
    const later = new Date('2026-11-17T12:00:00Z');
    expect(buildRibbon(window, e, later, true).segments[0]!.past).toBe(true);
    const other = buildRibbon(window, e, later, false);
    expect(other.now).toBeNull();
    expect(other.segments[0]!.past).toBe(false);
  });

  it('places ticks every 3 hours from the start of the window', () => {
    const m = buildRibbon(window, [], new Date('2026-11-17T08:00:00Z'), true);
    expect(m.ticks.map((t) => t.iso.slice(11, 16))).toEqual(['06:00', '09:00', '12:00', '15:00', '18:00', '21:00']);
  });
});
