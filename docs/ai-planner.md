# AI planner (design — implementation in Phase 3)

> Nothing in this document is implemented yet. The database tables it relies on (`PlanningProposal`, `PlanningChange`, `AIConversation`, `AIMessage`) exist since Phase 1.

## Rule

**AI proposes → deterministic engine validates → user approves.** The LLM never writes to the database or the calendar.

## Pipeline

1. **Intent recognition + structured extraction** — the provider returns JSON matching a Zod schema (`create_weekly_plan`, `reschedule_unfinished`, `add_tasks`, `ask_clarification`…). Invalid output is retried once with the validation errors, then surfaced as a clarification question.
2. **Context retrieval** — preferences, availability rules, events in the period (with locked/fixed flags and versions), open tasks, trips, habits. Only the minimum needed is sent to the provider.
3. **Scheduling engine** — `packages/scheduling-engine` places activities under hard constraints and scores options.
4. **Proposal** — stored as `PlanningProposal` (`PENDING`, `expiresAt`, `baseFingerprint` = hash of the relevant calendar/task versions) with one `PlanningChange` per create/update/delete/unscheduled item, each with its explanation and conflicts.
5. **Review** — UI shows before/after, conflicts, unscheduled items with reasons; the user accepts all, edits, rejects individual changes, or regenerates (new revision, old one `SUPERSEDED`).
6. **Approval** — in one transaction: recompute the fingerprint and each target's `version`; if anything changed → refuse with a "calendar changed, regenerate?" response. Otherwise apply accepted changes, set `APPLIED`, write audit entries.

## Provider abstraction (`packages/ai`)

```ts
interface AiProvider {
  name: string;
  complete<T>(req: { system: string; messages: Msg[]; schema: ZodType<T>; tools?: Tool[] }): Promise<{ data: T; usage: TokenUsage }>;
}
```

Model and provider come from env (`AI_PROVIDER`, `AI_MODEL`). Retries with backoff on transient errors; token usage stored on `AIMessage`; logs exclude message content by default.
