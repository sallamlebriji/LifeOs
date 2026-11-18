import { Injectable } from '@nestjs/common';
import {
  DEFAULT_TIMEZONE,
  localDateKey,
  localDayRange,
  localWeekday,
  type MyDayResponse,
} from '@lifeos/shared';
import { CalendarService, occurrencesIn } from '../calendar/calendar.module';
import { PrismaService } from '../prisma/prisma.service';
import { buildMyDay, type HabitRow } from './my-day.builder';

const categorySelect = { select: { id: true, name: true, color: true } } as const;

/** Date-only columns are stored as UTC midnight of the local calendar date. */
function dateOnly(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

@Injectable()
export class MyDayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: CalendarService,
  ) {}

  async get(userId: string, dateKey?: string, now: Date = new Date()): Promise<MyDayResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { preferences: true },
    });
    const prefs = user.preferences;
    const timezone = prefs?.timezone ?? DEFAULT_TIMEZONE;
    const todayKey = localDateKey(now, timezone);
    const date = dateKey ?? todayKey;
    // Noon UTC of the requested date is always inside that local day for real timezones (±14h).
    const anchor = new Date(`${date}T12:00:00Z`);
    const dayRange = localDayRange(anchor, timezone);
    const weekday = localWeekday(anchor, timezone);
    const isToday = date === todayKey;

    // Every query is scoped by userId — the only source of which is the verified token.
    const [events, taskBlocks, tasks, habits, goals] = await Promise.all([
      this.calendar.rowsFor(userId, dayRange).then((rows) => occurrencesIn(rows, dayRange)),
      this.prisma.taskSchedule.findMany({
        where: {
          userId,
          status: { not: 'CANCELLED' },
          startAt: { lt: dayRange.end },
          endAt: { gt: dayRange.start },
        },
        include: {
          task: {
            select: { id: true, title: true, priority: true, category: categorySelect },
          },
        },
        take: 200,
      }),
      this.prisma.task.findMany({
        where: {
          userId,
          parentId: null,
          status: { not: 'CANCELLED' },
          OR: [
            { plannedDate: dateOnly(date) },
            { dueAt: { gte: dayRange.start, lt: dayRange.end } },
            { completedAt: { gte: dayRange.start, lt: dayRange.end } },
            // Overdue work keeps surfacing on today until it's handled.
            ...(isToday
              ? [{ dueAt: { lt: dayRange.start }, status: { in: ['TODO' as const, 'IN_PROGRESS' as const] } }]
              : []),
          ],
        },
        include: {
          category: categorySelect,
          project: { select: { id: true, name: true } },
        },
        take: 200,
      }),
      this.prisma.habit.findMany({
        where: { userId, archivedAt: null },
        include: {
          logs: {
            where: { date: { lte: dateOnly(date) } },
            orderBy: { date: 'desc' },
            take: 120,
            select: { date: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.goal.findMany({
        where: {
          userId,
          status: { in: ['ACTIVE', 'NOT_STARTED'] },
          level: { in: ['DAILY', 'WEEKLY', 'MONTHLY'] },
        },
        orderBy: [{ priority: 'desc' }, { deadline: 'asc' }],
        take: 4,
      }),
    ]);

    const dueHabits: HabitRow[] = habits
      .filter((h) => {
        if (h.frequency === 'DAILY') return true;
        const days = Array.isArray(h.daysOfWeek) ? (h.daysOfWeek as number[]) : [];
        // Weekly habits without explicit days are shown every day (counted per week later).
        return days.length === 0 || days.includes(weekday);
      })
      .map((h) => ({
        id: h.id,
        name: h.name,
        color: h.color,
        icon: h.icon,
        completedDates: h.logs.map((l) => l.date.toISOString().slice(0, 10)),
        schedule: {
          frequency: h.frequency,
          daysOfWeek: Array.isArray(h.daysOfWeek) ? (h.daysOfWeek as number[]) : null,
          timesPerWeek: h.timesPerWeek,
        },
        weekStartsOn: prefs?.weekStartsOn ?? 1,
      }));

    return buildMyDay({
      now,
      date,
      isToday,
      timezone,
      displayName: user.displayName,
      dayRange,
      dayStartTime: prefs?.dayStartTime ?? '07:00',
      dayEndTime: prefs?.dayEndTime ?? '22:00',
      minSessionMinutes: prefs?.minSessionMinutes ?? 25,
      maxDailyFocusMinutes: prefs?.maxDailyFocusMinutes ?? 480,
      events: events.map((e) => ({
        id: e.id,
        title: e.title,
        startAt: new Date(e.startAt),
        endAt: new Date(e.endAt),
        allDay: e.allDay,
        location: e.location,
        locked: e.locked,
        flexibility: e.flexibility,
        priority: e.priority,
        category: e.category,
      })),
      taskBlocks: taskBlocks.map((b) => ({
        id: b.id,
        startAt: b.startAt,
        endAt: b.endAt,
        locked: b.locked,
        task: b.task,
      })),
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        estimatedMinutes: t.estimatedMinutes,
        dueAt: t.dueAt,
        completedAt: t.completedAt,
        category: t.category,
        project: t.project,
      })),
      habits: dueHabits,
      goals: goals.map((g) => ({
        id: g.id,
        title: g.title,
        level: g.level,
        targetValue: g.targetValue === null ? null : Number(g.targetValue),
        currentValue: Number(g.currentValue),
        deadline: g.deadline,
      })),
    });
  }
}
