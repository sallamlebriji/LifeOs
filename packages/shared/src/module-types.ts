/**
 * Response contracts for the Phase 2 modules (tasks, goals, projects, calendar,
 * availability, habits). Dates are ISO strings; local dates are YYYY-MM-DD.
 */
import type { CategoryRef, TaskStatusValue } from './api-types';
import type { PriorityValue, TimeOfDayValue } from './constants';

export interface Page<T> {
  items: T[];
  /** Pass back as `cursor` to fetch the next page; null when there is none. */
  nextCursor: string | null;
}

export interface CategoryDto extends CategoryRef {
  kind: string;
  icon: string | null;
  sortOrder: number;
}

export interface TaskRef {
  id: string;
  title: string;
  status: TaskStatusValue;
}

export interface TaskDto {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatusValue;
  priority: PriorityValue;
  estimatedMinutes: number | null;
  actualMinutes: number | null;
  dueAt: string | null;
  plannedDate: string | null;
  schedulingMode: 'FLEXIBLE' | 'FIXED';
  fixedStartAt: string | null;
  splittable: boolean;
  minSessionMinutes: number | null;
  preferredTimeOfDay: TimeOfDayValue;
  recurrenceRule: string | null;
  completedAt: string | null;
  sortOrder: number;
  version: number;
  parentId: string | null;
  projectId: string | null;
  goalId: string | null;
  category: CategoryRef | null;
  project: { id: string; name: string } | null;
  subtaskCount: number;
  subtasksDone: number;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetailDto extends TaskDto {
  subtasks: TaskDto[];
  dependsOn: TaskRef[];
  blocks: TaskRef[];
}

export type GoalLevelValue = 'ANNUAL' | 'MONTHLY' | 'WEEKLY' | 'DAILY';
export type GoalStatusValue = 'NOT_STARTED' | 'ACTIVE' | 'COMPLETED' | 'ABANDONED';

export interface MilestoneDto {
  id: string;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
  sortOrder: number;
}

export interface ProgressEntry {
  at: string;
  value: number;
  note?: string;
}

export interface GoalDto {
  id: string;
  title: string;
  description: string | null;
  level: GoalLevelValue;
  priority: PriorityValue;
  status: GoalStatusValue;
  startDate: string | null;
  deadline: string | null;
  targetValue: number | null;
  currentValue: number;
  unit: string | null;
  /** 0–1. From target/current when a target exists, else from milestones. */
  progress: number;
  parentId: string | null;
  category: CategoryRef | null;
  milestones: MilestoneDto[];
  progressLog: ProgressEntry[];
  taskCount: number;
  createdAt: string;
  updatedAt: string;
}

export type ProjectStatusValue = 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED' | 'ARCHIVED';

export interface ProjectDto {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatusValue;
  priority: PriorityValue;
  color: string | null;
  startDate: string | null;
  deadline: string | null;
  goalId: string | null;
  category: CategoryRef | null;
  taskCounts: Record<TaskStatusValue, number>;
  /** Sum of tracked minutes across the project's tasks. */
  trackedMinutes: number;
  estimatedMinutes: number;
  milestones: MilestoneDto[];
  createdAt: string;
  updatedAt: string;
}

export interface CalendarEventDto {
  /** Series id. For recurring events, occurrences share it and differ by `occurrenceStart`. */
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timezone: string;
  recurrenceRule: string | null;
  /** Start of this occurrence's series anchor when expanded from a rule. */
  seriesStartAt: string;
  isOccurrence: boolean;
  priority: PriorityValue;
  flexibility: 'FIXED' | 'FLEXIBLE';
  locked: boolean;
  color: string | null;
  source: 'MANUAL' | 'AI' | 'EXTERNAL';
  category: CategoryRef | null;
  projectId: string | null;
  version: number;
}

export interface ConflictDto {
  a: { id: string; title: string; startAt: string };
  b: { id: string; title: string; startAt: string };
  start: string;
  end: string;
  overlapMinutes: number;
}

export interface CalendarRangeResponse {
  events: CalendarEventDto[];
  conflicts: ConflictDto[];
}

export interface EventMutationResponse {
  event: CalendarEventDto;
  /** Other events this one overlaps (a warning, never a hard block). */
  conflicts: Array<{ id: string; title: string; startAt: string; endAt: string }>;
}

export type AvailabilityKindValue = 'WORKING_HOURS' | 'UNAVAILABLE' | 'PREFERRED' | 'PROTECTED_FREE_TIME';

export interface AvailabilityRuleDto {
  id: string;
  kind: AvailabilityKindValue;
  label: string | null;
  weekday: number | null;
  startTime: string | null;
  endTime: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  active: boolean;
}

export interface HabitDto {
  id: string;
  name: string;
  description: string | null;
  frequency: 'DAILY' | 'WEEKLY' | 'CUSTOM';
  daysOfWeek: number[] | null;
  timesPerWeek: number | null;
  targetPerDay: number;
  reminderTime: string | null;
  color: string | null;
  icon: string | null;
  archived: boolean;
  category: CategoryRef | null;
  stats: HabitStats;
  /** Local dates (YYYY-MM-DD) completed within the requested window. */
  recent: string[];
}

export interface HabitStats {
  currentStreak: number;
  longestStreak: number;
  /** Share of due days completed over the last 28 days (0–1). */
  consistency28: number;
  completedThisWeek: number;
  dueThisWeek: number;
  totalCompletions: number;
}
