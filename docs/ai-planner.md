# AI planner (implemented in Phase 3)

> Code: `packages/scheduling-engine` (placement), `packages/ai` (provider + structured output), `apps/api/src/planner` (proposals, approval), `apps/web/src/app/(app)/planner` (UI).

## What works without an AI provider

The planner form (period, open tasks, extra activities such as "gym 3x, 1 h, evenings, a rest day between") goes straight to the deterministic engine. **No language model is needed to plan.** Plain-language requests need `AI_PROVIDER=openai`, `AI_MODEL` and `OPENAI_API_KEY`; without them `POST /planner/chat` answers **503 `AI_NOT_CONFIGURED`** and the UI says so. There is no fake fallback.

## Rule

**AI proposes → deterministic engine validates → user approves.** The LLM never writes to the database or the calendar.

## Pipeline

1. **Intent recognition + structured extraction** — the provider returns JSON matching a Zod schema (`create_weekly_plan`, `reschedule_unfinished`, `add_tasks`, `ask_clarification`…). Invalid output is retried once with the validation errors, then surfaced as a clarification question.
2. **Context retrieval** — preferences, availability rules, events in the period (with locked/fixed flags and versions), open tasks, trips, habits. Only the minimum needed is sent to the provider.
3. **Scheduling engine** — `packages/scheduling-engine` places activities under hard constraints and scores options.
4. **Proposal** — stored as `PlanningProposal` (`PENDING`, `expiresAt`, `baseFingerprint` = hash of the relevant calendar/task versions) with one `PlanningChange` per create/update/delete/unscheduled item, each with its explanation and conflicts.
5. **Review** — UI shows before/after, conflicts, unscheduled items with reasons; the user accepts all, edits, rejects individual changes, or regenerates (new revision, old one `SUPERSEDED`).
6. **Approval** — in one transaction: recompute the fingerprint and each target's `version`; if anything changed → refuse with a "calendar changed, regenerate?" response. Otherwise apply accepted changes, set `APPLIED`, write audit entries.

## As built

- **Context sent to the model**: today's date, weekday, timezone, locale and *open task titles only* — no ids, notes, events or personal details.
- **Output**: `planningIntentSchema` (`create_plan` | `ask_clarification`) in `@lifeos/validation`. Invalid JSON or schema errors are sent back once for correction; a second failure is a 503 `AI_FAILED`. Task titles are resolved server-side to the caller's own open tasks; unknown titles are ignored, never created.
- **Engine inputs**: events in the period (recurring series expanded), existing task blocks, weekly availability rules, one-off unavailable blocks, trips that block the calendar, and preferences (day/work hours, buffer, minimum session, daily focus limit, focus time, weights). Tasks without an estimate, already scheduled, or waiting on an open dependency are skipped with a stated reason.
- **Proposal**: `PlanningProposal` (`PENDING`, expires after `PROPOSAL_TTL_HOURS`, default 24 h) with one `PlanningChange` per block (`SCHEDULE_TASK` becomes a `TaskSchedule` on apply, `CREATE_EVENT` a flexible `CalendarEvent` with `source = AI`) and one `UNSCHEDULED` change per item that didn't fit (reason + suggestion).
- **Review**: accept, reject or move each change. A move is re-checked against events, task blocks and other kept changes (409 on overlap).
- **Apply**: one transaction. The fingerprint (sha256 of event/task/block versions, availability rules, trips and preferences in scope) is recomputed; any difference returns **409 `STALE_PROPOSAL`** and nothing is written. Each task's `version` must also match. Status moves `PENDING` to `APPLIED` with a version check (no double apply). Audit: `proposal.created/applied/rejected/reverted`.
- **Regenerate** creates revision n+1 and marks the old one `SUPERSEDED`. **Undo** removes what an applied proposal created, if nothing was edited since (`REVERTED`).
- Engine output is checked by an independent verifier; any violation aborts with 500 and nothing is stored.

## Provider abstraction (`packages/ai`)

```ts
interface AiProvider {
  name: string;
  complete<T>(req: { system: string; messages: Msg[]; schema: ZodType<T>; tools?: Tool[] }): Promise<{ data: T; usage: TokenUsage }>;
}
```

Model and provider come from env (`AI_PROVIDER`, `AI_MODEL`). Retries with backoff on transient errors; token usage stored on `AIMessage`; logs exclude message content by default.
