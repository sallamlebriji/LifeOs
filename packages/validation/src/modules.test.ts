import { describe, expect, it } from 'vitest';
import {
  availabilityRuleSchema,
  calendarRangeQuerySchema,
  createEventSchema,
  createHabitSchema,
  createTaskSchema,
  listTasksQuerySchema,
  updateTaskSchema,
} from './modules';

describe('module schemas', () => {
  it('normalises recurrence rules and rejects unsupported ones', () => {
    expect(createTaskSchema.parse({ title: 'x', recurrenceRule: 'freq=weekly;byday=mo' }).recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=MO');
    expect(createTaskSchema.safeParse({ title: 'x', recurrenceRule: 'FREQ=MINUTELY' }).success).toBe(false);
  });

  it('requires a version and at least one change on task updates', () => {
    expect(updateTaskSchema.safeParse({ title: 'x' }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(updateTaskSchema.safeParse({ version: 1, title: 'x' }).success).toBe(true);
  });

  it('coerces task list queries', () => {
    expect(listTasksQuerySchema.parse({ limit: '10', includeSubtasks: 'true' })).toMatchObject({ limit: 10, includeSubtasks: true, sort: 'smart' });
  });

  it('validates event times and calendar ranges', () => {
    expect(createEventSchema.safeParse({ title: 'x', startAt: '2026-11-18T10:00:00Z', endAt: '2026-11-18T09:00:00Z' }).success).toBe(false);
    expect(createEventSchema.safeParse({ title: 'x', startAt: '2026-11-01T10:00:00Z', endAt: '2026-11-20T09:00:00Z' }).success).toBe(false);
    expect(calendarRangeQuerySchema.safeParse({ from: '2026-01-01T00:00:00Z', to: '2026-04-01T00:00:00Z' }).success).toBe(false);
    const ok = calendarRangeQuerySchema.parse({ from: '2026-11-16T00:00:00Z', to: '2026-11-23T00:00:00Z' });
    expect(ok.from).toBeInstanceOf(Date);
  });

  it('requires either a weekly window or a one-off block for availability', () => {
    expect(availabilityRuleSchema.safeParse({ kind: 'UNAVAILABLE' }).success).toBe(false);
    expect(availabilityRuleSchema.safeParse({ kind: 'WORKING_HOURS', weekday: 1, startTime: '09:00', endTime: '17:00' }).success).toBe(true);
    expect(
      availabilityRuleSchema.safeParse({ kind: 'UNAVAILABLE', weekday: 1, startTime: '09:00', endTime: '10:00', startsAt: '2026-12-01T00:00:00Z', endsAt: '2026-12-02T00:00:00Z' }).success,
    ).toBe(false);
  });

  it('checks habit frequency details', () => {
    expect(createHabitSchema.safeParse({ name: 'Gym', frequency: 'WEEKLY' }).success).toBe(false);
    expect(createHabitSchema.safeParse({ name: 'Gym', frequency: 'WEEKLY', daysOfWeek: [1, 3] }).success).toBe(true);
    expect(createHabitSchema.safeParse({ name: 'Gym', frequency: 'CUSTOM', timesPerWeek: 3 }).success).toBe(true);
  });
});
