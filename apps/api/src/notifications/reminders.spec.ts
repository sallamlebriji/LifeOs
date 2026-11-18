import { describe, expect, it } from 'vitest';
import { reminderCandidates } from './reminders';

const now = new Date('2026-11-18T08:00:00Z'); // 09:00 in Paris
const base = { now, horizonMinutes: 24 * 60, timezone: 'Europe/Paris', eventReminderMinutes: 15, events: [], tasks: [], habits: [] };

describe('reminderCandidates', () => {
  it('reminds before events and deadlines, never for past or all-day items', () => {
    const out = reminderCandidates({
      ...base,
      events: [
        { id: 'e1', title: 'Dentist', start: new Date('2026-11-18T13:00:00Z'), allDay: false, location: 'Rue X' },
        { id: 'e2', title: 'Past', start: new Date('2026-11-18T07:00:00Z'), allDay: false, location: null },
        { id: 'e3', title: 'Holiday', start: new Date('2026-11-18T23:00:00Z'), allDay: true, location: null },
        { id: 'e4', title: 'Soon', start: new Date('2026-11-18T08:05:00Z'), allDay: false, location: null },
      ],
      tasks: [{ id: 't1', title: 'Report', dueAt: new Date('2026-11-18T16:00:00Z') }],
    });
    expect(out.map((r) => [r.dedupeKey, r.scheduledFor.toISOString()])).toEqual([
      ['event:e4:2026-11-18T08:05:00.000Z', '2026-11-18T08:00:00.000Z'], // inside the lead time: remind now
      ['event:e1:2026-11-18T13:00:00.000Z', '2026-11-18T12:45:00.000Z'],
      ['task-due:t1:2026-11-18T16:00:00.000Z', '2026-11-18T15:00:00.000Z'],
    ]);
    expect(out[1]!.body).toBe('Starts at 14:00 · Rue X');
  });

  it('reminds for due habits at their local time unless already done', () => {
    const habit = { frequency: 'DAILY' as const, daysOfWeek: null, timesPerWeek: null, reminderTime: '20:30' };
    const out = reminderCandidates({
      ...base,
      habits: [
        { ...habit, id: 'h1', name: 'Read', doneDates: [] },
        { ...habit, id: 'h2', name: 'Meditate', doneDates: ['2026-11-18'] },
        { ...habit, id: 'h3', name: 'Gym', frequency: 'WEEKLY', daysOfWeek: [1], doneDates: [] }, // Monday only
      ],
    });
    // Tomorrow's 20:30 is past the 24-hour window; Meditate is already done today; Gym isn't due on Wednesday.
    expect(out.map((r) => r.dedupeKey)).toEqual(['habit:h1:2026-11-18']);
    expect(out[0]!.scheduledFor.toISOString()).toBe('2026-11-18T19:30:00.000Z');
  });
});
