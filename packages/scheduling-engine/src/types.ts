import type { PriorityValue, TimeOfDayValue } from '@lifeos/shared';

export interface SchedulingWeights {
  priority: number;
  urgency: number;
  goalImportance: number;
  timeSlotFit: number;
  continuity: number;
}

export const DEFAULT_WEIGHTS: SchedulingWeights = {
  priority: 0.3,
  urgency: 0.25,
  goalImportance: 0.2,
  timeSlotFit: 0.15,
  continuity: 0.1,
};

export interface EnginePreferences {
  dayStartTime: string; // HH:mm local
  dayEndTime: string;
  workStartTime: string;
  workEndTime: string;
  workDays: number[]; // 0 = Sunday
  bufferMinutes: number;
  minSessionMinutes: number;
  maxDailyFocusMinutes: number;
  preferredFocusTime: TimeOfDayValue;
  weights?: Partial<SchedulingWeights> | null;
}

export interface BusyBlock {
  id: string;
  title: string;
  start: Date;
  end: Date;
  /** Locked/fixed blocks are never moved; the engine never moves existing blocks at all. */
  locked: boolean;
  /** Task blocks count toward the daily focus limit. */
  kind: 'event' | 'task-block';
}

export interface WeeklyRule {
  kind: 'WORKING_HOURS' | 'UNAVAILABLE' | 'PREFERRED' | 'PROTECTED_FREE_TIME';
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface Activity {
  id: string;
  title: string;
  kind: 'task' | 'activity';
  /** Total minutes for a task; minutes per session for a repeated activity. */
  durationMinutes: number;
  /** Repeated activities: how many sessions in the period (default 1). */
  sessions?: number;
  splittable?: boolean;
  minSessionMinutes?: number | null;
  deadline?: Date | null;
  earliest?: Date | null;
  priority: PriorityValue;
  /** 0–1, e.g. linked to an active goal. */
  goalImportance?: number;
  preferredTimeOfDay?: TimeOfDayValue;
  /** 'work': inside working hours; 'personal': outside them; 'any'. */
  window?: 'work' | 'personal' | 'any';
  /** Minimum hours between two sessions of this activity (e.g. workout recovery). */
  recoveryHours?: number;
  /** Fixed-time tasks are placed exactly here or reported unscheduled. */
  fixedStart?: Date | null;
}

export interface EngineInput {
  /** Inclusive local dates (YYYY-MM-DD). */
  period: { startDate: string; endDate: string };
  timezone: string;
  /** Nothing is scheduled before this instant (defaults to the period start). */
  now?: Date;
  preferences: EnginePreferences;
  busy: BusyBlock[];
  /** One-off unavailable intervals (availability blocks, trips). */
  unavailable: Array<{ start: Date; end: Date; reason?: string }>;
  weeklyRules: WeeklyRule[];
  activities: Activity[];
}

export interface Placement {
  activityId: string;
  title: string;
  start: Date;
  end: Date;
  /** 0-based session / chunk index for this activity. */
  index: number;
  score: number;
  reasons: string[];
}

export type UnscheduledReason =
  | 'DEADLINE_PASSED'
  | 'NO_TIME_BEFORE_DEADLINE'
  | 'DAILY_FOCUS_LIMIT'
  | 'FIXED_TIME_TAKEN'
  | 'NO_FREE_SLOT';

export interface Unscheduled {
  activityId: string;
  title: string;
  minutesRequested: number;
  minutesPlaced: number;
  reason: UnscheduledReason;
  suggestion: string;
}

export interface EngineResult {
  scheduled: Placement[];
  unscheduled: Unscheduled[];
  /** Overlaps that already exist between busy blocks (never created by the engine). */
  conflicts: Array<{ a: string; b: string; overlapMinutes: number }>;
  /** Hard-constraint violations found by the verifier; empty unless there is a bug. */
  violations: string[];
  /** Local date → minutes of busy + scheduled time. */
  dailyWorkload: Record<string, number>;
  /** Free minutes left inside the day windows after placement. */
  freeMinutes: number;
  /** 0–1 overall quality: placed share × average placement score. */
  score: number;
  explanations: string[];
}
