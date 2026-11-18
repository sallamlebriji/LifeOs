/**
 * Habit schedule and statistics, computed on local dates (YYYY-MM-DD) so they
 * are timezone-independent once the caller has resolved "today".
 */

export interface HabitSchedule {
  frequency: 'DAILY' | 'WEEKLY' | 'CUSTOM';
  /** Weekday indexes (0 = Sunday) when the habit is due. */
  daysOfWeek: number[] | null;
  /** "N times a week, any days" — used when daysOfWeek is empty. */
  timesPerWeek: number | null;
}

export interface HabitStatsResult {
  currentStreak: number;
  longestStreak: number;
  /** "days" for day-based habits, "weeks" for N-times-a-week habits. */
  streakUnit: 'days' | 'weeks';
  consistency28: number;
  completedThisWeek: number;
  dueThisWeek: number;
  totalCompletions: number;
}

const DAY = 86_400_000;

export function addDaysKey(dateKey: string, days: number): string {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

export function weekdayOfKey(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

/** First day (YYYY-MM-DD) of the week containing `dateKey`. */
export function startOfWeekKey(dateKey: string, weekStartsOn: number): string {
  const diff = (weekdayOfKey(dateKey) - weekStartsOn + 7) % 7;
  return addDaysKey(dateKey, -diff);
}

function isWeeklyQuota(s: HabitSchedule): boolean {
  return (!s.daysOfWeek || s.daysOfWeek.length === 0) && !!s.timesPerWeek && s.frequency !== 'DAILY';
}

/** Whether a day-based habit is due on `dateKey`. Weekly-quota habits are "eligible" every day. */
export function isHabitDue(s: HabitSchedule, dateKey: string): boolean {
  if (s.frequency === 'DAILY') return true;
  if (s.daysOfWeek && s.daysOfWeek.length > 0) return s.daysOfWeek.includes(weekdayOfKey(dateKey));
  return true;
}

export function habitStats(args: {
  schedule: HabitSchedule;
  completedDates: readonly string[];
  today: string;
  weekStartsOn: number;
  /** Habit creation date: days before it are never "due". */
  createdOn?: string;
}): HabitStatsResult {
  const { schedule, today, weekStartsOn, createdOn } = args;
  const done = new Set(args.completedDates.filter((d) => d <= today));
  const totalCompletions = done.size;
  const earliest = [...done].sort()[0] ?? today;
  const floor = createdOn && createdOn < earliest ? createdOn : earliest;
  const weekStart = startOfWeekKey(today, weekStartsOn);

  if (isWeeklyQuota(schedule)) {
    const target = schedule.timesPerWeek!;
    const countWeek = (start: string) => {
      let n = 0;
      for (let i = 0; i < 7; i++) if (done.has(addDaysKey(start, i))) n++;
      return n;
    };
    const thisWeek = countWeek(weekStart);
    // Streak of weeks meeting the quota; the current week counts once met, and
    // an unfinished current week doesn't break the streak.
    let current = thisWeek >= target ? 1 : 0;
    let cursor = addDaysKey(weekStart, -7);
    while (cursor >= startOfWeekKey(floor, weekStartsOn) && countWeek(cursor) >= target) {
      current++;
      cursor = addDaysKey(cursor, -7);
    }
    let longest = 0;
    let run = 0;
    for (let w = startOfWeekKey(floor, weekStartsOn); w <= weekStart; w = addDaysKey(w, 7)) {
      if (countWeek(w) >= target) longest = Math.max(longest, ++run);
      else if (w !== weekStart) run = 0;
    }
    let met = 0;
    for (let i = 1; i <= 4; i++) met += Math.min(target, countWeek(addDaysKey(weekStart, -7 * i)));
    return {
      currentStreak: current,
      longestStreak: Math.max(longest, current),
      streakUnit: 'weeks',
      consistency28: Math.round((met / (4 * target)) * 100) / 100,
      completedThisWeek: thisWeek,
      dueThisWeek: target,
      totalCompletions,
    };
  }

  const since = floor; // completions logged before creation (imports) still count
  const due = (d: string) => isHabitDue(schedule, d) && d >= since;

  // Current streak: walk back over due days; today only counts once done.
  let current = 0;
  let cursor = done.has(today) || !due(today) ? today : addDaysKey(today, -1);
  while (cursor >= floor) {
    if (due(cursor)) {
      if (!done.has(cursor)) break;
      current++;
    }
    cursor = addDaysKey(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  for (let d = floor; d <= today; d = addDaysKey(d, 1)) {
    if (!due(d)) continue;
    if (done.has(d)) longest = Math.max(longest, ++run);
    else if (d !== today) run = 0;
  }

  let dueCount = 0;
  let doneCount = 0;
  for (let i = 0; i < 28; i++) {
    const d = addDaysKey(today, -i);
    if (!due(d)) continue;
    if (d === today && !done.has(d)) continue; // today isn't missed yet
    dueCount++;
    if (done.has(d)) doneCount++;
  }

  let dueThisWeek = 0;
  let completedThisWeek = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDaysKey(weekStart, i);
    if (isHabitDue(schedule, d)) dueThisWeek++;
    if (done.has(d)) completedThisWeek++;
  }

  return {
    currentStreak: current,
    longestStreak: Math.max(longest, current),
    streakUnit: 'days',
    consistency28: dueCount === 0 ? 0 : Math.round((doneCount / dueCount) * 100) / 100,
    completedThisWeek,
    dueThisWeek,
    totalCompletions,
  };
}
