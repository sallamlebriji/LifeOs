/** Weekly and monthly reports computed from the user's own rows (read-only). */
import { Controller, Get, Injectable, Module, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  addDaysKey,
  type AnalyticsDto,
  isHabitDue,
  localDateKey,
  localTimeOnDay,
  startOfWeekKey,
} from '@lifeos/shared';
import { analyticsQuerySchema, type AnalyticsQuery } from '@lifeos/validation';
import { CalendarModule, CalendarService, occurrencesIn } from '../calendar/calendar.module';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators';
import { fromDateOnly, userTimezone } from '../common/module-helpers';
import { ApiZodQuery } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { goalProgress } from '../goals/goals.module';
import { PrismaService } from '../prisma/prisma.service';

const minutesOf = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60_000));

/** Period bounds as local date keys (inclusive start, exclusive end). */
export function periodKeys(period: 'week' | 'month', date: string, weekStartsOn: number): { start: string; end: string } {
  if (period === 'week') {
    const start = startOfWeekKey(date, weekStartsOn);
    return { start, end: addDaysKey(start, 7) };
  }
  const start = `${date.slice(0, 7)}-01`;
  const [y, m] = start.split('-').map(Number) as [number, number];
  return { start, end: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10) };
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: CalendarService,
  ) {}

  async report(userId: string, q: AnalyticsQuery, now = new Date()): Promise<AnalyticsDto> {
    const { timezone, weekStartsOn } = await userTimezone(this.prisma, userId);
    const today = localDateKey(now, timezone);
    const { start, end } = periodKeys(q.period, q.date ?? today, weekStartsOn);
    const at = (key: string) => localTimeOnDay(new Date(`${key}T12:00:00Z`), '00:00', timezone);
    const range = { start: at(start), end: at(end) };
    const days: string[] = [];
    for (let d = start; d < end; d = addDaysKey(d, 1)) days.push(d);
    const dayOf = (instant: Date) => localDateKey(instant, timezone);

    const [created, completed, overdueOpen, openInPeriod, eventRows, blocks, habits, habitLogs, workouts, study, goals] = await Promise.all([
      this.prisma.task.count({ where: { userId, createdAt: { gte: range.start, lt: range.end } } }),
      this.prisma.task.findMany({
        where: { userId, status: 'COMPLETED', completedAt: { gte: range.start, lt: range.end } },
        select: { completedAt: true, estimatedMinutes: true, actualMinutes: true },
      }),
      this.prisma.task.count({ where: { userId, status: { in: ['TODO', 'IN_PROGRESS'] }, dueAt: { lt: now } } }),
      this.prisma.task.count({
        where: {
          userId,
          status: { in: ['TODO', 'IN_PROGRESS'] },
          OR: [{ dueAt: { gte: range.start, lt: range.end } }, { plannedDate: { gte: new Date(`${start}T00:00:00Z`), lt: new Date(`${end}T00:00:00Z`) } }],
        },
      }),
      this.calendar.rowsFor(userId, range),
      this.prisma.taskSchedule.findMany({
        where: { userId, status: { not: 'CANCELLED' }, startAt: { lt: range.end }, endAt: { gt: range.start } },
        include: { task: { select: { category: { select: { name: true, color: true } } } } },
      }),
      this.prisma.habit.findMany({ where: { userId, archivedAt: null }, select: { id: true, name: true, frequency: true, daysOfWeek: true, timesPerWeek: true, createdAt: true } }),
      this.prisma.habitLog.findMany({
        where: { userId, date: { gte: new Date(`${start}T00:00:00Z`), lt: new Date(`${end}T00:00:00Z`) } },
        select: { habitId: true, date: true },
      }),
      this.prisma.workout.findMany({ where: { userId, startAt: { gte: range.start, lt: range.end } }, select: { durationMinutes: true } }),
      this.prisma.studySession.findMany({
        where: { userId, completedAt: { not: null }, startAt: { gte: range.start, lt: range.end } },
        select: { startAt: true, endAt: true, kind: true },
      }),
      this.prisma.goal.findMany({
        where: { userId, status: { in: ['ACTIVE', 'NOT_STARTED', 'COMPLETED'] }, OR: [{ deadline: null }, { deadline: { gte: new Date(`${start}T00:00:00Z`) } }] },
        include: { milestones: { select: { completedAt: true } } },
        orderBy: [{ level: 'asc' }, { priority: 'desc' }],
        take: 10,
      }),
    ]);

    // Time by category: timed events (clipped to the period) and task blocks.
    const byCategory = new Map<string, { name: string; color: string; minutes: number }>();
    const add = (name: string, color: string, minutes: number) => {
      const cur = byCategory.get(name) ?? { name, color, minutes: 0 };
      cur.minutes += minutes;
      byCategory.set(name, cur);
    };
    const clip = (s: Date, e: Date) => minutesOf(s < range.start ? range.start : s, e > range.end ? range.end : e);
    for (const e of occurrencesIn(eventRows, range).filter((x) => !x.allDay)) {
      add(e.category?.name ?? 'Other', e.category?.color ?? '#8E8E93', clip(new Date(e.startAt), new Date(e.endAt)));
    }
    for (const b of blocks) add(b.task.category?.name ?? 'Other', b.task.category?.color ?? '#8E8E93', clip(b.startAt, b.endAt));

    // Habits: due days up to today vs completions.
    const lastDay = today < end ? today : addDaysKey(end, -1);
    const perHabit = habits.map((h) => {
      const schedule = { frequency: h.frequency, daysOfWeek: Array.isArray(h.daysOfWeek) ? (h.daysOfWeek as number[]) : null, timesPerWeek: h.timesPerWeek };
      const createdOn = localDateKey(h.createdAt, timezone);
      const doneDays = new Set(habitLogs.filter((l) => l.habitId === h.id).map((l) => fromDateOnly(l.date)!));
      let due = 0;
      const quota = !schedule.daysOfWeek?.length && schedule.timesPerWeek && schedule.frequency !== 'DAILY';
      if (quota) {
        due = Math.round((schedule.timesPerWeek! * days.filter((d) => d <= lastDay && d >= createdOn).length) / 7);
      } else {
        for (const d of days) if (d <= lastDay && d >= createdOn && isHabitDue(schedule, d)) due++;
      }
      return { name: h.name, done: doneDays.size, due: Math.max(due, doneDays.size) };
    });
    const dueTotal = perHabit.reduce((s, h) => s + h.due, 0);
    const doneTotal = perHabit.reduce((s, h) => s + Math.min(h.done, h.due), 0);

    const daily = days.map((d) => ({
      date: d,
      tasksCompleted: completed.filter((t) => t.completedAt && dayOf(t.completedAt) === d).length,
      focusMinutes: blocks.filter((b) => dayOf(b.startAt) === d).reduce((s, b) => s + minutesOf(b.startAt, b.endAt), 0),
    }));

    return {
      period: q.period,
      start,
      end: addDaysKey(end, -1),
      tasks: {
        created,
        completed: completed.length,
        overdueOpen,
        completionRate: completed.length + openInPeriod ? Math.round((completed.length / (completed.length + openInPeriod)) * 100) / 100 : 0,
      },
      timeByCategory: [...byCategory.values()].filter((c) => c.minutes > 0).sort((a, b) => b.minutes - a.minutes),
      plannedVsActual: {
        plannedMinutes: completed.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0),
        trackedMinutes: completed.reduce((s, t) => s + (t.actualMinutes ?? 0), 0),
      },
      habits: { consistency: dueTotal ? Math.round((doneTotal / dueTotal) * 100) / 100 : 0, perHabit },
      workouts: { sessions: workouts.length, minutes: workouts.reduce((s, w) => s + w.durationMinutes, 0) },
      study: {
        minutes: study.reduce((s, x) => s + minutesOf(x.startAt, x.endAt), 0),
        reviewsDone: study.filter((x) => x.kind === 'REVISION').length,
      },
      goals: goals.map((g) => ({
        title: g.title,
        level: g.level,
        progress: goalProgress({
          status: g.status,
          targetValue: g.targetValue === null ? null : Number(g.targetValue),
          currentValue: Number(g.currentValue),
          milestones: g.milestones,
        }),
      })),
      daily,
    };
  }
}

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  @ApiOperation({ summary: 'Weekly or monthly report: tasks, time by category, habits, workouts, study, goals' })
  @ApiZodQuery(analyticsQuerySchema)
  report(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(analyticsQuerySchema)) q: AnalyticsQuery) {
    return this.analytics.report(user.userId, q);
  }
}

@Module({ imports: [CalendarModule], controllers: [AnalyticsController], providers: [AnalyticsService] })
export class AnalyticsModule {}
