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

/** A scheduled block of work on a task (created by applying a plan). */
export interface TaskBlockDto {
  id: string;
  taskId: string;
  title: string;
  startAt: string;
  endAt: string;
  status: 'PLANNED' | 'DONE' | 'MISSED' | 'CANCELLED';
  source: 'MANUAL' | 'AI' | 'EXTERNAL';
  taskStatus: 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}

export interface CalendarRangeResponse {
  events: CalendarEventDto[];
  conflicts: ConflictDto[];
  taskBlocks: TaskBlockDto[];
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

// ─── Planner (Phase 3) ───────────────────────────────────────────────────

export type ProposalStatusValue = 'PENDING' | 'APPLIED' | 'REJECTED' | 'EXPIRED' | 'SUPERSEDED' | 'FAILED' | 'REVERTED';

export interface PlanningChangeDto {
  id: string;
  type: 'CREATE_EVENT' | 'UPDATE_EVENT' | 'DELETE_EVENT' | 'SCHEDULE_TASK' | 'UNSCHEDULED';
  decision: 'PROPOSED' | 'ACCEPTED' | 'MODIFIED' | 'REJECTED';
  title: string;
  targetTaskId: string | null;
  startAt: string | null;
  endAt: string | null;
  reason: string | null;
}

export interface ProposalDto {
  id: string;
  status: ProposalStatusValue;
  revision: number;
  periodStart: string;
  periodEnd: string;
  summary: string | null;
  explanation: { lines: string[]; dailyWorkload: Record<string, number>; freeMinutes: number; existingConflicts: number } | null;
  score: number | null;
  expiresAt: string;
  createdAt: string;
  appliedAt: string | null;
  conversationId: string | null;
  supersedesId: string | null;
  changes: PlanningChangeDto[];
}

export interface PlannerChatResponse {
  conversationId: string;
  reply: string;
  proposal: ProposalDto | null;
}

export interface PlannerStatusDto {
  aiConfigured: boolean;
  provider: string | null;
  model: string | null;
}

// ─── Sports, study, travel, analytics (Phase 4) ──────────────────────────

export type WorkoutTypeValue = 'STRENGTH' | 'CARDIO' | 'MOBILITY' | 'SPORT' | 'OTHER';

export interface ExerciseDto {
  id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  weightKg: number | null;
  distanceKm: number | null;
  durationMinutes: number | null;
}

export interface WorkoutDto {
  id: string;
  title: string;
  type: WorkoutTypeValue;
  startAt: string;
  durationMinutes: number;
  intensity: number | null;
  notes: string | null;
  exercises: ExerciseDto[];
}

export interface SportsStatsDto {
  weekStart: string;
  weeklyTarget: number;
  thisWeek: { sessions: number; minutes: number };
  /** Consecutive past weeks (plus this one once met) reaching the target. */
  weekStreak: number;
  /** Last 8 weeks, oldest first. */
  weeks: Array<{ weekStart: string; sessions: number; minutes: number }>;
  minutesByType: Record<WorkoutTypeValue, number>;
  lastWorkoutAt: string | null;
  /** Days since the last hard session (intensity ≥ 8), for recovery hints. */
  daysSinceHardSession: number | null;
}

export interface StudyChapter {
  id: string;
  title: string;
  done: boolean;
}

export interface StudySubjectDto {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  importance: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  examDate: string | null;
  weeklyTargetMinutes: number | null;
  chapters: StudyChapter[];
  minutesThisWeek: number;
  progress: number;
  dueReviews: number;
}

export interface StudySessionDto {
  id: string;
  subjectId: string;
  subjectName: string;
  kind: 'LEARNING' | 'REVISION' | 'EXAM';
  topic: string | null;
  startAt: string;
  endAt: string;
  completedAt: string | null;
  quality: number | null;
  intervalDays: number | null;
  nextReviewAt: string | null;
  notes: string | null;
}

export interface DueReviewDto {
  subjectId: string;
  subjectName: string;
  topic: string;
  dueAt: string;
  lastQuality: number | null;
  repetitions: number;
}

export interface TripChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface TripActivityDto {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  startAt: string | null;
  endAt: string | null;
  reservation: string | null;
  cost: number | null;
}

export interface TripDto {
  id: string;
  title: string;
  destination: string;
  departureAt: string;
  returnAt: string;
  timezone: string;
  status: 'PLANNING' | 'BOOKED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  transportation: string | null;
  accommodation: string | null;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  spent: number;
  companions: string[];
  checklist: TripChecklistItem[];
  documents: Array<{ label: string; reference: string }>;
  notes: string | null;
  blocksCalendar: boolean;
  activities: TripActivityDto[];
}

export interface AnalyticsDto {
  period: 'week' | 'month';
  start: string;
  end: string;
  tasks: { created: number; completed: number; overdueOpen: number; completionRate: number };
  /** Category name → minutes of events and task blocks. */
  timeByCategory: Array<{ name: string; color: string; minutes: number }>;
  plannedVsActual: { plannedMinutes: number; trackedMinutes: number };
  habits: { consistency: number; perHabit: Array<{ name: string; done: number; due: number }> };
  workouts: { sessions: number; minutes: number };
  study: { minutes: number; reviewsDone: number };
  goals: Array<{ title: string; progress: number; level: string }>;
  /** Per local day: completed tasks and focus minutes. */
  daily: Array<{ date: string; tasksCompleted: number; focusMinutes: number }>;
}

// ─── Notifications & integrations (Phase 5) ──────────────────────────────

export interface NotificationDto {
  id: string;
  type: 'TASK_REMINDER' | 'EVENT_REMINDER' | 'HABIT_REMINDER' | 'DEADLINE_ALERT' | 'AI_SUGGESTION' | 'SYSTEM';
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  at: string;
  read: boolean;
}

export interface NotificationListDto {
  items: NotificationDto[];
  unread: number;
}

export interface IntegrationStatusDto {
  provider: 'GOOGLE_CALENDAR' | 'APPLE_CALENDAR';
  /** Server has the credentials/keys needed to offer this integration. */
  available: boolean;
  unavailableReason: string | null;
  connected: boolean;
  account: string | null;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | null;
  lastSyncedAt: string | null;
  lastSync: { status: string; itemsProcessed: number; itemsFailed: number; errorMessage: string | null; finishedAt: string | null } | null;
}
