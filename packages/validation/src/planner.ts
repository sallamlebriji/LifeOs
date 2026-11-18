/** Planner request schemas. The same shapes come from the UI form and from validated AI output. */
import { z } from 'zod';
import { isoDateSchema, timeOfDaySchema } from './common';
import { CATEGORY_KIND_VALUES } from './modules';

export const plannedActivitySchema = z.object({
  title: z.string().trim().min(1).max(120),
  /** Minutes per session. */
  durationMinutes: z.number().int().min(15).max(480),
  sessions: z.number().int().min(1).max(14).default(1),
  preferredTimeOfDay: timeOfDaySchema.default('ANY'),
  window: z.enum(['work', 'personal', 'any']).default('any'),
  recoveryHours: z.number().min(0).max(72).default(0),
  category: z.enum(CATEGORY_KIND_VALUES).optional(),
});
export type PlannedActivityInput = z.input<typeof plannedActivitySchema>;

const MAX_PLAN_DAYS = 14;

export const planRequestSchema = z
  .object({
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    /** Schedule every open flexible task with an estimate… */
    includeOpenTasks: z.boolean().default(true),
    /** …or only these. */
    taskIds: z.array(z.uuid()).max(100).optional(),
    activities: z.array(plannedActivitySchema).max(20).default([]),
    /** Add study time from subjects with a weekly target or an upcoming exam. */
    includeStudy: z.boolean().default(false),
    conversationId: z.uuid().optional(),
    /** Free-text note shown on the proposal. */
    note: z.string().trim().max(500).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.endDate < v.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'End date is before the start date' });
    const days = (Date.parse(v.endDate) - Date.parse(v.startDate)) / 86_400_000 + 1;
    if (days > MAX_PLAN_DAYS) ctx.addIssue({ code: 'custom', path: ['endDate'], message: `Plan at most ${MAX_PLAN_DAYS} days at a time` });
    if (!v.includeOpenTasks && !v.taskIds?.length && !v.activities.length && !v.includeStudy) {
      ctx.addIssue({ code: 'custom', path: ['activities'], message: 'Nothing to plan — include tasks or add an activity' });
    }
  });
export type PlanRequestInput = z.input<typeof planRequestSchema>;
export type PlanRequest = z.output<typeof planRequestSchema>;

export const changeDecisionSchema = z
  .object({
    decision: z.enum(['ACCEPTED', 'REJECTED', 'MODIFIED']),
    startAt: z.iso.datetime({ offset: true }).optional(),
    endAt: z.iso.datetime({ offset: true }).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.decision === 'MODIFIED') {
      if (!v.startAt || !v.endAt) ctx.addIssue({ code: 'custom', path: ['startAt'], message: 'A modified change needs a start and end' });
      else if (v.endAt <= v.startAt) ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'End must be after start' });
    }
  });
export type ChangeDecisionInput = z.input<typeof changeDecisionSchema>;

export const chatMessageSchema = z.object({
  message: z.string().trim().min(1, 'Say what you want to plan').max(2000),
  conversationId: z.uuid().optional(),
});
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

/**
 * What the language model must return. It never contains ids or writes:
 * tasks are referenced by title and resolved server-side against the user's own rows.
 */
export const planningIntentSchema = z.discriminatedUnion('intent', [
  z.object({
    intent: z.literal('create_plan'),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    includeOpenTasks: z.boolean(),
    taskTitles: z.array(z.string().max(300)).max(50).default([]),
    activities: z.array(plannedActivitySchema).max(20).default([]),
    summary: z.string().max(500),
  }),
  z.object({
    intent: z.literal('ask_clarification'),
    question: z.string().min(1).max(500),
  }),
]);
export type PlanningIntent = z.output<typeof planningIntentSchema>;
