/** Pure reminder generation — which notifications should exist for the next window. */
import { isHabitDue, localDateKey, localTimeOnDay } from '@lifeos/shared';

export interface ReminderCandidate {
  type: 'EVENT_REMINDER' | 'DEADLINE_ALERT' | 'HABIT_REMINDER';
  title: string;
  body: string | null;
  entityType: 'CalendarEvent' | 'Task' | 'Habit';
  entityId: string;
  scheduledFor: Date;
  dedupeKey: string;
}

export interface ReminderInput {
  now: Date;
  horizonMinutes: number;
  timezone: string;
  eventReminderMinutes: number;
  events: Array<{ id: string; title: string; start: Date; allDay: boolean; location: string | null }>;
  tasks: Array<{ id: string; title: string; dueAt: Date }>;
  habits: Array<{
    id: string;
    name: string;
    reminderTime: string;
    frequency: 'DAILY' | 'WEEKLY' | 'CUSTOM';
    daysOfWeek: number[] | null;
    timesPerWeek: number | null;
    doneDates: string[];
  }>;
}

const clock = (d: Date, tz: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

export function reminderCandidates(input: ReminderInput): ReminderCandidate[] {
  const { now, timezone: tz } = input;
  const until = new Date(now.getTime() + input.horizonMinutes * 60_000);
  const out: ReminderCandidate[] = [];

  for (const e of input.events) {
    if (e.allDay || e.start <= now || e.start > until) continue;
    const at = new Date(e.start.getTime() - input.eventReminderMinutes * 60_000);
    out.push({
      type: 'EVENT_REMINDER',
      title: e.title,
      body: `Starts at ${clock(e.start, tz)}${e.location ? ` · ${e.location}` : ''}`,
      entityType: 'CalendarEvent',
      entityId: e.id,
      scheduledFor: at < now ? now : at,
      dedupeKey: `event:${e.id}:${e.start.toISOString()}`,
    });
  }

  for (const t of input.tasks) {
    if (t.dueAt <= now || t.dueAt > until) continue;
    const at = new Date(t.dueAt.getTime() - 60 * 60_000);
    out.push({
      type: 'DEADLINE_ALERT',
      title: t.title,
      body: `Due at ${clock(t.dueAt, tz)}`,
      entityType: 'Task',
      entityId: t.id,
      scheduledFor: at < now ? now : at,
      dedupeKey: `task-due:${t.id}:${t.dueAt.toISOString()}`,
    });
  }

  // Habits: today's (and tomorrow's, if inside the window) reminder time, unless already done.
  for (const day of [localDateKey(now, tz), localDateKey(until, tz)].filter((d, i, a) => a.indexOf(d) === i)) {
    for (const h of input.habits) {
      if (!isHabitDue(h, day) || h.doneDates.includes(day)) continue;
      const at = localTimeOnDay(new Date(`${day}T12:00:00Z`), h.reminderTime, tz);
      if (at <= now || at > until) continue;
      out.push({
        type: 'HABIT_REMINDER',
        title: h.name,
        body: 'Time for your habit',
        entityType: 'Habit',
        entityId: h.id,
        scheduledFor: at,
        dedupeKey: `habit:${h.id}:${day}`,
      });
    }
  }
  return out.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
}
