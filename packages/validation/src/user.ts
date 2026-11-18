import { z } from 'zod';
import { displayNameSchema } from './auth';
import {
  clockSchema,
  localeSchema,
  themeSchema,
  timeOfDaySchema,
  timezoneSchema,
} from './common';

export const updateProfileSchema = z
  .object({
    displayName: displayNameSchema,
    avatarUrl: z.url({ protocol: /^https$/ }).max(500).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const schedulingWeightsSchema = z
  .object({
    priority: z.number().min(0).max(1),
    urgency: z.number().min(0).max(1),
    goalImportance: z.number().min(0).max(1),
    timeSlotFit: z.number().min(0).max(1),
    sessionContinuity: z.number().min(0).max(1),
  })
  .refine(
    (w) => Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 0.001,
    'Weights must add up to 100%',
  );
export type SchedulingWeights = z.infer<typeof schedulingWeightsSchema>;

export const DEFAULT_SCHEDULING_WEIGHTS: SchedulingWeights = {
  priority: 0.3,
  urgency: 0.25,
  goalImportance: 0.2,
  timeSlotFit: 0.15,
  sessionContinuity: 0.1,
};

const weekdaySchema = z.number().int().min(0).max(6);

const toMinutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

export const updatePreferencesSchema = z
  .object({
    timezone: timezoneSchema,
    locale: localeSchema,
    theme: themeSchema,
    weekStartsOn: weekdaySchema,
    dayStartTime: clockSchema,
    dayEndTime: clockSchema,
    workStartTime: clockSchema,
    workEndTime: clockSchema,
    workDays: z.array(weekdaySchema).max(7).refine((d) => new Set(d).size === d.length, {
      message: 'Duplicate weekday',
    }),
    bufferMinutes: z.number().int().min(0).max(120),
    minSessionMinutes: z.number().int().min(5).max(240),
    maxDailyFocusMinutes: z.number().int().min(30).max(960),
    preferredFocusTime: timeOfDaySchema,
    schedulingWeights: schedulingWeightsSchema.nullable(),
    notificationsEnabled: z.boolean(),
    emailReminders: z.boolean(),
    eventReminderMinutes: z.number().int().min(0).max(1440),
  })
  .partial()
  .superRefine((v, ctx) => {
    if (v.dayStartTime && v.dayEndTime && toMinutes(v.dayStartTime) >= toMinutes(v.dayEndTime)) {
      ctx.addIssue({ code: 'custom', path: ['dayEndTime'], message: 'Day must end after it starts' });
    }
    if (v.workStartTime && v.workEndTime && toMinutes(v.workStartTime) >= toMinutes(v.workEndTime)) {
      ctx.addIssue({ code: 'custom', path: ['workEndTime'], message: 'Work must end after it starts' });
    }
  });
export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(128),
  confirm: z.literal('DELETE'),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
