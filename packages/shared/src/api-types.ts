/**
 * API response contracts shared by the API, web and (later) mobile clients.
 * Dates are ISO-8601 strings in UTC; local presentation is the client's job.
 */
import type { PriorityValue, ThemeValue, TimeOfDayValue, SupportedLocale } from './constants';

export type TaskStatusValue = 'TODO' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: 'USER' | 'ADMIN';
  emailVerified: boolean;
  createdAt: string;
}

export interface UserPreferencesDto {
  timezone: string;
  locale: SupportedLocale;
  theme: ThemeValue;
  weekStartsOn: number;
  dayStartTime: string;
  dayEndTime: string;
  workStartTime: string;
  workEndTime: string;
  workDays: number[];
  bufferMinutes: number;
  minSessionMinutes: number;
  maxDailyFocusMinutes: number;
  preferredFocusTime: TimeOfDayValue;
  schedulingWeights: Record<string, number> | null;
  notificationsEnabled: boolean;
}

export interface AuthResponse {
  user: PublicUser;
  /** Short-lived JWT. Web clients may ignore it (httpOnly cookie is set too). */
  accessToken: string;
  accessTokenExpiresAt: string;
  /** Only returned to non-browser clients that ask for it (X-LifeOS-Client: mobile). */
  refreshToken?: string;
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  /** Field-level validation issues: path → messages. */
  issues?: Record<string, string[]>;
}

export interface CategoryRef {
  id: string;
  name: string;
  color: string;
}

export interface MyDayEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  location: string | null;
  locked: boolean;
  flexible: boolean;
  priority: PriorityValue;
  category: CategoryRef | null;
  kind: 'event' | 'task-block';
  taskId?: string;
}

export interface MyDayTask {
  id: string;
  title: string;
  status: TaskStatusValue;
  priority: PriorityValue;
  estimatedMinutes: number | null;
  dueAt: string | null;
  overdue: boolean;
  completedAt: string | null;
  category: CategoryRef | null;
  project: { id: string; name: string } | null;
}

export interface MyDayHabit {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  doneToday: boolean;
  streak: number;
}

export interface MyDayGoal {
  id: string;
  title: string;
  level: 'ANNUAL' | 'MONTHLY' | 'WEEKLY' | 'DAILY';
  progress: number | null; // 0–1, null if no target
  deadline: string | null;
}

export interface FreeSlot {
  start: string;
  end: string;
  minutes: number;
}

export interface Insight {
  id: string;
  tone: 'info' | 'warning' | 'positive';
  title: string;
  detail: string;
}

export interface MyDayResponse {
  date: string; // YYYY-MM-DD in the user's timezone
  timezone: string;
  isToday: boolean;
  generatedAt: string;
  greetingName: string;
  dayWindow: { start: string; end: string };
  agenda: MyDayEvent[];
  nextUp: MyDayEvent | null;
  topPriority: MyDayTask | null;
  tasks: MyDayTask[];
  habits: MyDayHabit[];
  goals: MyDayGoal[];
  freeSlots: FreeSlot[];
  stats: {
    tasksTotal: number;
    tasksCompleted: number;
    habitsTotal: number;
    habitsCompleted: number;
    scheduledMinutes: number;
    freeMinutes: number;
    plannedTaskMinutes: number;
    overdueCount: number;
  };
  /** Rule-based insights computed deterministically from the user's data. */
  insights: Insight[];
}
