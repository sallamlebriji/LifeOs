import { z } from 'zod';
import { isoDateSchema, prioritySchema } from './common';

export const myDayQuerySchema = z.object({
  /** Local date (in the user's timezone). Defaults to "today". */
  date: isoDateSchema.optional(),
});
export type MyDayQuery = z.infer<typeof myDayQuerySchema>;

/** Minimal quick-add for the My Day dashboard (full Tasks module ships in Phase 2). */
export const quickAddTaskSchema = z.object({
  title: z.string().trim().min(1, 'Give the task a title').max(300),
  priority: prioritySchema.default('MEDIUM'),
  estimatedMinutes: z.number().int().min(5).max(720).optional(),
  plannedDate: isoDateSchema.optional(),
});
export type QuickAddTaskInput = z.input<typeof quickAddTaskSchema>;

export const setTaskStatusSchema = z.object({
  status: z.enum(['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
});
export type SetTaskStatusInput = z.infer<typeof setTaskStatusSchema>;

export const toggleHabitSchema = z.object({
  date: isoDateSchema,
  done: z.boolean(),
});
export type ToggleHabitInput = z.infer<typeof toggleHabitSchema>;
