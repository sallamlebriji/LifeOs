# Scheduling engine (design — implementation in Phase 3)

> Not implemented yet. Phase 1 ships the building blocks it will reuse: DST-safe day windows (`localDayRange`, `localTimeOnDay`) and interval maths (`mergeIntervals`, `freeIntervals`) in `@lifeos/shared`, all unit-tested. My Day's free-time calculation already uses them.

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
