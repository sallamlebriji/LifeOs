# Scheduling engine (implemented in Phase 3)

> `packages/scheduling-engine`: `schedule(input)` and an independent `verify(input, result)`. Tests cover preferred-time placement with buffers, locked/unavailable/protected time, splitting with a minimum session, recovery spacing, work-hours windows, every unscheduled reason, a DST day, order-independence, and a 150-case seeded property test (no hard-constraint violation; every requested minute is either placed or reported).

## Algorithm

1. Per local day: the day window (clipped to now) minus busy blocks plus/minus the buffer, unavailable blocks, and weekly *unavailable* / *protected free time* rules. Working hours come from weekly *working hours* rules, else from preferences on work days.
2. Activities are ordered: fixed-time first, then by priority x w1 + urgency x w2 + goal importance x w3, then id (determinism).
3. Each session or chunk scans 15-minute starts in every allowed interval, filters hard constraints (deadline, earliest start, daily focus limit, recovery gap, sessions per day, work/personal window) and scores time fit x w4 + urgency x w2 + continuity x w5. Ties keep the earliest start.
4. Splittable tasks try the whole duration first, then the largest chunk at least the minimum session (at most 2 h), never leaving an unplaceable remainder.
5. What doesn't fit is classified by relaxing one constraint at a time: `DEADLINE_PASSED`, `DAILY_FOCUS_LIMIT`, `NO_TIME_BEFORE_DEADLINE`, `FIXED_TIME_TAKEN`, `NO_FREE_SLOT`, each with a suggestion.

## Shape

A pure TypeScript package (`packages/scheduling-engine`): no I/O, no AI dependency, deterministic for the same input.

```ts
schedule(input: {
  period: { start: Date; end: Date };
  timezone: string;
  preferences: { dayStart; dayEnd; workHours; bufferMinutes; minSessionMinutes; maxDailyFocusMinutes; weights };
  busy: Array<{ start; end; locked: boolean; movable: boolean }>;
  unavailable: Interval[];         // availability rules, trips
  activities: Activity[];          // duration, frequency, deadline, priority, splittable, preferred time, recovery
}): {
  scheduled; unscheduled /* with reasons + suggestions */; conflicts; violations; explanations;
  dailyWorkload; freeTime; score;
}
```

## Hard constraints (never violated)

Locked and fixed events, unavailable periods, trips, deadlines, minimum session length, working hours, recovery periods between workouts, timezone/DST rules. If an activity can't be placed it stays **unscheduled with a reason** — never dropped, never forced.

## Scoring (configurable, default weights)

Priority 30% · Urgency 25% · Goal importance 20% · Time-slot fit 15% · Session continuity 10%. Stored per user in `UserPreferences.schedulingWeights` (validated to sum to 1). Hard constraints always win over score.

## Testing plan

Property-style tests (no overlap, all hard constraints hold), DST transition days, locked-event immovability, splitting, recovery spacing, deadline-infeasible cases, determinism.
