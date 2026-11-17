/**
 * Pure computation of the My Day view from already-loaded rows.
 * No I/O here: everything is deterministic given (input, now) so it's unit-tested.
 */
import {
  freeIntervals,
  type FreeSlot,
  type Insight,
  type Interval,
  localTimeOnDay,
  type MyDayEvent,
  type MyDayGoal,
  type MyDayHabit,
  type MyDayResponse,
  type MyDayTask,
  type PriorityValue,
  type TaskStatusValue,
  totalMinutes,
} from '@lifeos/shared';

export const PRIORITY_RANK: Record<PriorityValue, number> = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

export interface CategoryRow {
  id: string;
  name: string;
  color: string;
}

export interface EventRow {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location: string | null;
  locked: boolean;
  flexibility: 'FIXED' | 'FLEXIBLE';
  priority: PriorityValue;
  category: CategoryRow | null;
}

export interface TaskBlockRow {
  id: string;
  startAt: Date;
  endAt: Date;
  locked: boolean;
  task: { id: string; title: string; priority: PriorityValue; category: CategoryRow | null };
}

export interface TaskRow {
  id: string;
  title: string;
  status: TaskStatusValue;
  priority: PriorityValue;
  estimatedMinutes: number | null;
  dueAt: Date | null;
  completedAt: Date | null;
  category: CategoryRow | null;
  project: { id: string; name: string } | null;
}

export interface HabitRow {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  /** Local date keys (YYYY-MM-DD) with a completion, most recent first. */
  completedDates: string[];
}

export interface GoalRow {
  id: string;
  title: string;
  level: MyDayGoal['level'];
  targetValue: number | null;
  currentValue: number;
  deadline: Date | null;
}

export interface MyDayInput {
  now: Date;
  date: string; // local YYYY-MM-DD
  isToday: boolean;
  timezone: string;
  displayName: string;
  dayRange: Interval; // UTC bounds of the local day
  dayStartTime: string;
  dayEndTime: string;
  minSessionMinutes: number;
  maxDailyFocusMinutes: number;
  events: EventRow[];
  taskBlocks: TaskBlockRow[];
  tasks: TaskRow[];
  habits: HabitRow[];
  goals: GoalRow[];
}

function iso(d: Date): string {
  return d.toISOString();
}

/** Consecutive-day streak ending today (or yesterday, if today isn't done yet). */
export function computeStreak(completedDates: string[], today: string): number {
  const done = new Set(completedDates);
  const cursor = new Date(`${today}T00:00:00Z`);
  if (!done.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
  let streak = 0;
  while (done.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
}

export function compareTasks(a: MyDayTask, b: MyDayTask): number {
  const open = (t: MyDayTask) => (t.status === 'COMPLETED' || t.status === 'CANCELLED' ? 1 : 0);
  return (
    open(a) - open(b) ||
    Number(b.overdue) - Number(a.overdue) ||
    PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
    (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') ||
    a.title.localeCompare(b.title)
  );
}

function formatClock(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h} h ${m} min`;
  return h ? `${h} h` : `${m} min`;
}

export function buildMyDay(input: MyDayInput): MyDayResponse {
  const { now, timezone } = input;

  // ── Agenda: events + task time blocks, chronological ──────────────────
  const agenda: MyDayEvent[] = [
    ...input.events.map<MyDayEvent>((e) => ({
      id: e.id,
      title: e.title,
      startAt: iso(e.startAt),
      endAt: iso(e.endAt),
      allDay: e.allDay,
      location: e.location,
      locked: e.locked,
      flexible: e.flexibility === 'FLEXIBLE',
      priority: e.priority,
      category: e.category,
      kind: 'event',
    })),
    ...input.taskBlocks.map<MyDayEvent>((b) => ({
      id: b.id,
      title: b.task.title,
      startAt: iso(b.startAt),
      endAt: iso(b.endAt),
      allDay: false,
      location: null,
      locked: b.locked,
      flexible: !b.locked,
      priority: b.task.priority,
      category: b.task.category,
      kind: 'task-block',
      taskId: b.task.id,
    })),
  ].sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startAt.localeCompare(b.startAt));

  const nextUp =
    agenda.find((e) => !e.allDay && new Date(e.endAt).getTime() > now.getTime()) ?? null;

  // ── Tasks ─────────────────────────────────────────────────────────────
  const tasks = input.tasks
    .map<MyDayTask>((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      estimatedMinutes: t.estimatedMinutes,
      dueAt: t.dueAt ? iso(t.dueAt) : null,
      overdue:
        t.status !== 'COMPLETED' &&
        t.status !== 'CANCELLED' &&
        t.dueAt !== null &&
        t.dueAt.getTime() < now.getTime(),
      completedAt: t.completedAt ? iso(t.completedAt) : null,
      category: t.category,
      project: t.project,
    }))
    .sort(compareTasks);
  const openTasks = tasks.filter((t) => t.status === 'TODO' || t.status === 'IN_PROGRESS');
  const topPriority = openTasks[0] ?? null;

  // ── Free time inside the user's day window (only the remainder if today) ─
  const windowStart = localTimeOnDay(input.dayRange.start, input.dayStartTime, timezone);
  const windowEnd = localTimeOnDay(input.dayRange.start, input.dayEndTime, timezone);
  const effectiveStart =
    input.isToday && now.getTime() > windowStart.getTime() ? now : windowStart;
  const busy: Interval[] = agenda
    .filter((e) => !e.allDay)
    .map((e) => ({ start: new Date(e.startAt), end: new Date(e.endAt) }));
  const free =
    effectiveStart.getTime() < windowEnd.getTime()
      ? freeIntervals({ start: effectiveStart, end: windowEnd }, busy)
      : [];
  const freeSlots: FreeSlot[] = free
    .map((f) => ({ start: iso(f.start), end: iso(f.end), minutes: Math.floor(totalMinutes([f])) }))
    .filter((f) => f.minutes >= input.minSessionMinutes);
  const freeMinutes = freeSlots.reduce((s, f) => s + f.minutes, 0);
  const scheduledMinutes = Math.round(
    totalMinutes(
      busy.map((b) => ({
        start: new Date(Math.max(b.start.getTime(), input.dayRange.start.getTime())),
        end: new Date(Math.min(b.end.getTime(), input.dayRange.end.getTime())),
      })),
    ),
  );
  const plannedTaskMinutes = openTasks.reduce((s, t) => s + (t.estimatedMinutes ?? 0), 0);

  // ── Habits & goals ────────────────────────────────────────────────────
  const habits: MyDayHabit[] = input.habits.map((h) => ({
    id: h.id,
    name: h.name,
    color: h.color,
    icon: h.icon,
    doneToday: h.completedDates.includes(input.date),
    streak: computeStreak(h.completedDates, input.date),
  }));

  const goals: MyDayGoal[] = input.goals.map((g) => ({
    id: g.id,
    title: g.title,
    level: g.level,
    progress:
      g.targetValue && g.targetValue > 0 ? Math.min(1, Math.max(0, g.currentValue / g.targetValue)) : null,
    deadline: g.deadline ? g.deadline.toISOString().slice(0, 10) : null,
  }));

  const overdueCount = tasks.filter((t) => t.overdue).length;
  const stats = {
    tasksTotal: tasks.filter((t) => t.status !== 'CANCELLED').length,
    tasksCompleted: tasks.filter((t) => t.status === 'COMPLETED').length,
    habitsTotal: habits.length,
    habitsCompleted: habits.filter((h) => h.doneToday).length,
    scheduledMinutes,
    freeMinutes,
    plannedTaskMinutes,
    overdueCount,
  };

  return {
    date: input.date,
    timezone,
    isToday: input.isToday,
    generatedAt: iso(now),
    greetingName: input.displayName,
    dayWindow: { start: iso(windowStart), end: iso(windowEnd) },
    agenda,
    nextUp,
    topPriority,
    tasks,
    habits,
    goals,
    freeSlots,
    stats,
    insights: buildInsights({ ...input, openTasks, freeSlots, stats, topPriority }),
  };
}

function buildInsights(ctx: {
  timezone: string;
  maxDailyFocusMinutes: number;
  openTasks: MyDayTask[];
  freeSlots: FreeSlot[];
  stats: MyDayResponse['stats'];
  topPriority: MyDayTask | null;
}): Insight[] {
  const insights: Insight[] = [];
  const { stats, freeSlots, topPriority, timezone } = ctx;

  if (stats.overdueCount > 0) {
    insights.push({
      id: 'overdue',
      tone: 'warning',
      title: `${stats.overdueCount} overdue ${stats.overdueCount === 1 ? 'task' : 'tasks'}`,
      detail: 'Reschedule or close them so today reflects what you can really do.',
    });
  }

  if (stats.plannedTaskMinutes > stats.freeMinutes && stats.plannedTaskMinutes > 0) {
    insights.push({
      id: 'overcommitted',
      tone: 'warning',
      title: 'More work than free time',
      detail: `Open tasks need about ${formatDuration(stats.plannedTaskMinutes)}, but only ${formatDuration(
        stats.freeMinutes,
      )} is free. Consider moving lower-priority tasks.`,
    });
  }

  if (topPriority?.estimatedMinutes) {
    const fit = freeSlots.find((s) => s.minutes >= topPriority.estimatedMinutes!);
    if (fit) {
      insights.push({
        id: 'focus-slot',
        tone: 'info',
        title: `Time for “${topPriority.title}”`,
        detail: `Your ${formatDuration(fit.minutes)} window from ${formatClock(
          new Date(fit.start),
          timezone,
        )} to ${formatClock(new Date(fit.end), timezone)} fits it (${formatDuration(
          topPriority.estimatedMinutes,
        )}).`,
      });
    }
  }

  if (stats.scheduledMinutes > ctx.maxDailyFocusMinutes) {
    insights.push({
      id: 'heavy-day',
      tone: 'warning',
      title: 'Heavy day',
      detail: `${formatDuration(stats.scheduledMinutes)} is scheduled, above your ${formatDuration(
        ctx.maxDailyFocusMinutes,
      )} limit. Protect a break.`,
    });
  }

  if (stats.tasksTotal > 0 && stats.tasksCompleted === stats.tasksTotal) {
    insights.push({
      id: 'all-done',
      tone: 'positive',
      title: 'Everything is done',
      detail: 'All of today’s tasks are complete. Enjoy the free time.',
    });
  }

  return insights;
}
