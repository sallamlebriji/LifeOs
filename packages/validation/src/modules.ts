/**
 * Request schemas for the Phase 2 modules: categories, tasks, goals, projects,
 * calendar events, availability rules and habits.
 */
import { rruleProblem } from '@lifeos/shared';
import { z } from 'zod';
import {
  clockSchema,
  hexColorSchema,
  isoDateSchema,
  paginationQuerySchema,
  prioritySchema,
  timeOfDaySchema,
  timezoneSchema,
} from './common';

const title = (max: number, msg = 'Give it a title') => z.string().trim().min(1, msg).max(max);
const notes = z.string().max(10_000).nullable();
const id = z.uuid();
const instant = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const versionSchema = z.number().int().min(1);

export const rruleSchema = z
  .string()
  .trim()
  .toUpperCase()
  .superRefine((v, ctx) => {
    const problem = rruleProblem(v);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

/** "true"/"false" in query strings. */
const queryBool = z.enum(['true', 'false']).transform((v) => v === 'true');

/** Every update must change something. */
function nonEmpty<T extends z.ZodObject>(schema: T) {
  return schema.refine((v) => Object.keys(v).some((k) => k !== 'version'), 'Nothing to update');
}

// ─── Categories ──────────────────────────────────────────────────────────

export const CATEGORY_KIND_VALUES = ['WORK', 'PERSONAL', 'SPORT', 'STUDY', 'TRAVEL', 'HEALTH', 'SOCIAL', 'OTHER'] as const;

export const createCategorySchema = z.object({
  name: title(60, 'Name the category'),
  kind: z.enum(CATEGORY_KIND_VALUES).default('OTHER'),
  color: hexColorSchema,
  icon: z.string().max(40).nullable().optional(),
});
export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export const updateCategorySchema = nonEmpty(createCategorySchema.partial());
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;

// ─── Tasks ───────────────────────────────────────────────────────────────

export const TASK_STATUS_VALUES = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;

const taskFields = {
  title: title(300),
  notes: notes.optional(),
  priority: prioritySchema,
  estimatedMinutes: z.number().int().min(5).max(1440).nullable(),
  dueAt: instant.nullable(),
  plannedDate: isoDateSchema.nullable(),
  schedulingMode: z.enum(['FLEXIBLE', 'FIXED']),
  fixedStartAt: instant.nullable(),
  splittable: z.boolean(),
  minSessionMinutes: z.number().int().min(5).max(480).nullable(),
  preferredTimeOfDay: timeOfDaySchema,
  recurrenceRule: rruleSchema.nullable(),
  parentId: id.nullable(),
  projectId: id.nullable(),
  goalId: id.nullable(),
  categoryId: id.nullable(),
};

function taskRules(
  v: Partial<{
    schedulingMode: 'FLEXIBLE' | 'FIXED';
    fixedStartAt: Date | null;
    splittable: boolean;
    minSessionMinutes: number | null;
    estimatedMinutes: number | null;
  }>,
  ctx: z.RefinementCtx,
) {
  if (v.schedulingMode === 'FIXED' && v.fixedStartAt === null) {
    ctx.addIssue({ code: 'custom', path: ['fixedStartAt'], message: 'A fixed task needs a start time' });
  }
  if (v.schedulingMode === 'FIXED' && v.splittable) {
    ctx.addIssue({ code: 'custom', path: ['splittable'], message: 'A fixed-time task can’t be split' });
  }
  if (v.minSessionMinutes && v.estimatedMinutes && v.minSessionMinutes > v.estimatedMinutes) {
    ctx.addIssue({ code: 'custom', path: ['minSessionMinutes'], message: 'Minimum session is longer than the task' });
  }
}

export const createTaskSchema = z
  .object({
    ...taskFields,
    priority: prioritySchema.default('MEDIUM'),
    schedulingMode: taskFields.schedulingMode.default('FLEXIBLE'),
    splittable: z.boolean().default(false),
    preferredTimeOfDay: timeOfDaySchema.default('ANY'),
    estimatedMinutes: taskFields.estimatedMinutes.optional(),
    dueAt: taskFields.dueAt.optional(),
    plannedDate: taskFields.plannedDate.optional(),
    fixedStartAt: taskFields.fixedStartAt.optional(),
    minSessionMinutes: taskFields.minSessionMinutes.optional(),
    recurrenceRule: taskFields.recurrenceRule.optional(),
    parentId: id.nullable().optional(),
    projectId: id.nullable().optional(),
    goalId: id.nullable().optional(),
    categoryId: id.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.schedulingMode === 'FIXED' && !v.fixedStartAt) {
      ctx.addIssue({ code: 'custom', path: ['fixedStartAt'], message: 'A fixed task needs a start time' });
    }
    taskRules(v, ctx);
  });
export type CreateTaskInput = z.input<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({ ...taskFields, status: z.enum(TASK_STATUS_VALUES), sortOrder: z.number().int(), version: versionSchema })
  .partial()
  .required({ version: true })
  .superRefine(taskRules)
  .refine((v) => Object.keys(v).some((k) => k !== 'version'), 'Nothing to update');
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;

export const listTasksQuerySchema = paginationQuerySchema.extend({
  status: z.enum([...TASK_STATUS_VALUES, 'OPEN']).optional(),
  priority: prioritySchema.optional(),
  projectId: id.optional(),
  goalId: id.optional(),
  categoryId: id.optional(),
  /** Top-level tasks only (default) or include subtasks. */
  includeSubtasks: queryBool.optional(),
  q: z.string().trim().max(100).optional(),
  sort: z.enum(['smart', 'due', 'created', 'manual']).default('smart'),
});
export type ListTasksQuery = z.infer<typeof listTasksQuerySchema>;

export const addDependencySchema = z.object({ dependsOnId: id });
export type AddDependencyInput = z.infer<typeof addDependencySchema>;

export const logTimeSchema = z.object({ minutes: z.number().int().min(1).max(1440) });
export type LogTimeInput = z.infer<typeof logTimeSchema>;

export const reorderSchema = z.object({
  /** Ids in their new order; positions become sortOrder. */
  ids: z.array(id).min(1).max(500),
});
export type ReorderInput = z.infer<typeof reorderSchema>;

// ─── Goals ───────────────────────────────────────────────────────────────

export const GOAL_LEVEL_VALUES = ['ANNUAL', 'MONTHLY', 'WEEKLY', 'DAILY'] as const;
export const GOAL_STATUS_VALUES = ['NOT_STARTED', 'ACTIVE', 'COMPLETED', 'ABANDONED'] as const;

const goalFields = {
  title: title(200),
  description: notes,
  level: z.enum(GOAL_LEVEL_VALUES),
  priority: prioritySchema,
  status: z.enum(GOAL_STATUS_VALUES),
  startDate: isoDateSchema.nullable(),
  deadline: isoDateSchema.nullable(),
  targetValue: z.number().positive().max(1e9).nullable(),
  unit: z.string().trim().max(30).nullable(),
  parentId: id.nullable(),
  categoryId: id.nullable(),
};

function goalRules(v: { startDate?: string | null; deadline?: string | null }, ctx: z.RefinementCtx) {
  if (v.startDate && v.deadline && v.deadline < v.startDate) {
    ctx.addIssue({ code: 'custom', path: ['deadline'], message: 'Deadline is before the start date' });
  }
}

export const createGoalSchema = z
  .object({
    ...goalFields,
    description: notes.optional(),
    priority: prioritySchema.default('MEDIUM'),
    status: goalFields.status.default('ACTIVE'),
    startDate: goalFields.startDate.optional(),
    deadline: goalFields.deadline.optional(),
    targetValue: goalFields.targetValue.optional(),
    unit: goalFields.unit.optional(),
    parentId: id.nullable().optional(),
    categoryId: id.nullable().optional(),
  })
  .superRefine(goalRules);
export type CreateGoalInput = z.input<typeof createGoalSchema>;

export const updateGoalSchema = nonEmpty(z.object(goalFields).partial()).superRefine(goalRules);
export type UpdateGoalInput = z.input<typeof updateGoalSchema>;

export const listGoalsQuerySchema = paginationQuerySchema.extend({
  level: z.enum(GOAL_LEVEL_VALUES).optional(),
  status: z.enum(GOAL_STATUS_VALUES).optional(),
});
export type ListGoalsQuery = z.infer<typeof listGoalsQuerySchema>;

export const recordProgressSchema = z.object({
  value: z.number().min(0).max(1e9),
  note: z.string().trim().max(200).optional(),
});
export type RecordProgressInput = z.infer<typeof recordProgressSchema>;

export const createMilestoneSchema = z.object({
  title: title(200),
  dueDate: isoDateSchema.nullable().optional(),
});
export type CreateMilestoneInput = z.input<typeof createMilestoneSchema>;

export const updateMilestoneSchema = nonEmpty(
  z.object({ title: title(200), dueDate: isoDateSchema.nullable(), completed: z.boolean(), sortOrder: z.number().int() }).partial(),
);
export type UpdateMilestoneInput = z.input<typeof updateMilestoneSchema>;

// ─── Projects ────────────────────────────────────────────────────────────

export const PROJECT_STATUS_VALUES = ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'ARCHIVED'] as const;

const projectFields = {
  name: title(200, 'Name the project'),
  description: notes,
  status: z.enum(PROJECT_STATUS_VALUES),
  priority: prioritySchema,
  color: hexColorSchema.nullable(),
  startDate: isoDateSchema.nullable(),
  deadline: isoDateSchema.nullable(),
  goalId: id.nullable(),
  categoryId: id.nullable(),
};

export const createProjectSchema = z
  .object({
    ...projectFields,
    description: notes.optional(),
    status: projectFields.status.default('ACTIVE'),
    priority: prioritySchema.default('MEDIUM'),
    color: projectFields.color.optional(),
    startDate: projectFields.startDate.optional(),
    deadline: projectFields.deadline.optional(),
    goalId: id.nullable().optional(),
    categoryId: id.nullable().optional(),
  })
  .superRefine(goalRules);
export type CreateProjectInput = z.input<typeof createProjectSchema>;

export const updateProjectSchema = nonEmpty(z.object(projectFields).partial()).superRefine(goalRules);
export type UpdateProjectInput = z.input<typeof updateProjectSchema>;

export const listProjectsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(PROJECT_STATUS_VALUES).optional(),
});
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;

// ─── Calendar events ─────────────────────────────────────────────────────

const eventFields = {
  title: title(300),
  description: notes,
  location: z.string().trim().max(300).nullable(),
  startAt: instant,
  endAt: instant,
  allDay: z.boolean(),
  timezone: timezoneSchema,
  recurrenceRule: rruleSchema.nullable(),
  priority: prioritySchema,
  flexibility: z.enum(['FIXED', 'FLEXIBLE']),
  locked: z.boolean(),
  color: hexColorSchema.nullable(),
  categoryId: id.nullable(),
  projectId: id.nullable(),
};

const MAX_EVENT_MS = 14 * 86_400_000;
function eventRules(v: { startAt?: Date; endAt?: Date }, ctx: z.RefinementCtx) {
  if (v.startAt && v.endAt) {
    if (v.endAt <= v.startAt) ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'End must be after start' });
    else if (v.endAt.getTime() - v.startAt.getTime() > MAX_EVENT_MS) {
      ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'Events can last at most 14 days' });
    }
  }
}

export const createEventSchema = z
  .object({
    ...eventFields,
    description: notes.optional(),
    location: eventFields.location.optional(),
    allDay: z.boolean().default(false),
    timezone: timezoneSchema.optional(),
    recurrenceRule: eventFields.recurrenceRule.optional(),
    priority: prioritySchema.default('MEDIUM'),
    flexibility: eventFields.flexibility.default('FIXED'),
    locked: z.boolean().default(false),
    color: eventFields.color.optional(),
    categoryId: id.nullable().optional(),
    projectId: id.nullable().optional(),
  })
  .superRefine(eventRules);
export type CreateEventInput = z.input<typeof createEventSchema>;

export const updateEventSchema = z
  .object({ ...eventFields, version: versionSchema })
  .partial()
  .required({ version: true })
  .superRefine(eventRules)
  .refine((v) => Object.keys(v).some((k) => k !== 'version'), 'Nothing to update');
export type UpdateEventInput = z.input<typeof updateEventSchema>;

const MAX_RANGE_MS = 62 * 86_400_000;
export const calendarRangeQuerySchema = z
  .object({ from: instant, to: instant })
  .refine((v) => v.to > v.from, { path: ['to'], message: '`to` must be after `from`' })
  .refine((v) => v.to.getTime() - v.from.getTime() <= MAX_RANGE_MS, { path: ['to'], message: 'Range can be at most 62 days' });
export type CalendarRangeQuery = z.infer<typeof calendarRangeQuerySchema>;

// ─── Availability ────────────────────────────────────────────────────────

export const AVAILABILITY_KIND_VALUES = ['WORKING_HOURS', 'UNAVAILABLE', 'PREFERRED', 'PROTECTED_FREE_TIME'] as const;

export const availabilityRuleSchema = z
  .object({
    kind: z.enum(AVAILABILITY_KIND_VALUES),
    label: z.string().trim().max(100).nullable().optional(),
    /** Recurring weekly rule… */
    weekday: z.number().int().min(0).max(6).nullable().optional(),
    startTime: clockSchema.nullable().optional(),
    endTime: clockSchema.nullable().optional(),
    /** …or a one-off block. */
    startsAt: instant.nullable().optional(),
    endsAt: instant.nullable().optional(),
    timezone: timezoneSchema.optional(),
    active: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    const recurring = v.weekday !== null && v.weekday !== undefined;
    const oneOff = !!v.startsAt || !!v.endsAt;
    if (recurring === oneOff) {
      ctx.addIssue({ code: 'custom', path: ['weekday'], message: 'Choose a weekday with times, or a one-off date range' });
      return;
    }
    if (recurring) {
      if (!v.startTime || !v.endTime) {
        ctx.addIssue({ code: 'custom', path: ['startTime'], message: 'A weekly rule needs start and end times' });
      } else if (v.endTime <= v.startTime) {
        ctx.addIssue({ code: 'custom', path: ['endTime'], message: 'End must be after start' });
      }
    } else if (!v.startsAt || !v.endsAt || v.endsAt <= v.startsAt) {
      ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'A one-off block needs a start before its end' });
    }
  });
export type AvailabilityRuleInput = z.input<typeof availabilityRuleSchema>;

// ─── Habits ──────────────────────────────────────────────────────────────

const habitFields = {
  name: title(120, 'Name the habit'),
  description: notes,
  frequency: z.enum(['DAILY', 'WEEKLY', 'CUSTOM']),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).nullable(),
  timesPerWeek: z.number().int().min(1).max(7).nullable(),
  targetPerDay: z.number().int().min(1).max(50),
  reminderTime: clockSchema.nullable(),
  color: hexColorSchema.nullable(),
  icon: z.string().max(40).nullable(),
  categoryId: id.nullable(),
};

function habitRules(
  v: { frequency?: 'DAILY' | 'WEEKLY' | 'CUSTOM'; daysOfWeek?: number[] | null; timesPerWeek?: number | null },
  ctx: z.RefinementCtx,
) {
  if (v.frequency === 'WEEKLY' && (!v.daysOfWeek || v.daysOfWeek.length === 0)) {
    ctx.addIssue({ code: 'custom', path: ['daysOfWeek'], message: 'Pick at least one day' });
  }
  if (v.frequency === 'CUSTOM' && !v.timesPerWeek && (!v.daysOfWeek || v.daysOfWeek.length === 0)) {
    ctx.addIssue({ code: 'custom', path: ['timesPerWeek'], message: 'Set times per week or pick days' });
  }
}

export const createHabitSchema = z
  .object({
    ...habitFields,
    description: notes.optional(),
    frequency: habitFields.frequency.default('DAILY'),
    daysOfWeek: habitFields.daysOfWeek.optional(),
    timesPerWeek: habitFields.timesPerWeek.optional(),
    targetPerDay: habitFields.targetPerDay.default(1),
    reminderTime: habitFields.reminderTime.optional(),
    color: habitFields.color.optional(),
    icon: habitFields.icon.optional(),
    categoryId: id.nullable().optional(),
  })
  .superRefine(habitRules);
export type CreateHabitInput = z.input<typeof createHabitSchema>;

export const updateHabitSchema = nonEmpty(z.object({ ...habitFields, archived: z.boolean() }).partial());
export type UpdateHabitInput = z.input<typeof updateHabitSchema>;

export const listHabitsQuerySchema = z.object({
  archived: queryBool.optional(),
  /** Number of past days of completions to return (for the grid). */
  days: z.coerce.number().int().min(7).max(371).default(28),
});
export type ListHabitsQuery = z.infer<typeof listHabitsQuerySchema>;
