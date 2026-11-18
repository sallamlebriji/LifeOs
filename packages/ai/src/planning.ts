import { type PlanningIntent, planningIntentSchema } from '@lifeos/validation';
import { type AiProvider, type ChatMessage, type CompletionResult } from './provider';

export interface PlanningContext {
  today: string; // YYYY-MM-DD in the user's timezone
  weekday: string; // e.g. "Wednesday"
  timezone: string;
  locale: string;
  /** Titles only: the model never sees ids, notes or other personal details. */
  openTaskTitles: string[];
}

/**
 * The system prompt constrains the model to *describe* a plan. It cannot
 * create, move or delete anything; the deterministic engine does the placing.
 */
export function planningSystemPrompt(ctx: PlanningContext): string {
  return [
    'You are the planning assistant inside LifeOS, a personal planner.',
    'Turn the user’s request into a structured planning intent. You do not schedule anything yourself:',
    'a deterministic engine places items around the user’s calendar, and the user approves every change.',
    '',
    `Today is ${ctx.weekday} ${ctx.today} (timezone ${ctx.timezone}). Interpret "this week" as today through the coming Sunday,`,
    '"next week" as next Monday through Sunday, and "tomorrow" as the next day. Plans cover at most 14 days.',
    '',
    'Return intent "create_plan" when you know the period. Use "activities" for recurring or new things the user mentions',
    '(e.g. "gym 3 times this week, 1 hour" → sessions 3, durationMinutes 60, recoveryHours 24, window "personal").',
    'Study or work blocks use window "work" only if the user says so. Use preferredTimeOfDay when the user states one.',
    'Set includeOpenTasks true when the user wants their existing tasks planned; list specific ones in taskTitles,',
    'copying titles exactly from the list below. Never invent tasks that are not in the list — use activities instead.',
    'Return intent "ask_clarification" with one short question when the period or durations are genuinely unclear.',
    `Write "summary" and any question in the user’s language (${ctx.locale}).`,
    '',
    'Open tasks:',
    ...(ctx.openTaskTitles.length ? ctx.openTaskTitles.slice(0, 60).map((t) => `- ${t}`) : ['(none)']),
  ].join('\n');
}

export async function extractPlanningIntent(
  provider: AiProvider,
  ctx: PlanningContext,
  history: ChatMessage[],
): Promise<CompletionResult<PlanningIntent>> {
  return provider.complete({
    system: planningSystemPrompt(ctx),
    messages: history.slice(-12),
    schema: planningIntentSchema,
    schemaName: 'planning_intent',
  });
}
