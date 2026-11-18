/** Phase 4 request schemas: sports, study, travel, analytics. */
import { z } from 'zod';
import { hexColorSchema, isoDateSchema, prioritySchema, timezoneSchema } from './common';

const instant = z.iso.datetime({ offset: true }).transform((v) => new Date(v));
const notes = z.string().max(10_000).nullable();
const queryBool = z.enum(['true', 'false']).transform((v) => v === 'true');

// ─── Sports ──────────────────────────────────────────────────────────────

export const WORKOUT_TYPE_VALUES = ['STRENGTH', 'CARDIO', 'MOBILITY', 'SPORT', 'OTHER'] as const;

export const exerciseSchema = z.object({
  name: z.string().trim().min(1, 'Name the exercise').max(120),
  sets: z.number().int().min(1).max(100).nullable().optional(),
  reps: z.number().int().min(1).max(1000).nullable().optional(),
  weightKg: z.number().min(0).max(1000).nullable().optional(),
  distanceKm: z.number().min(0).max(1000).nullable().optional(),
  durationMinutes: z.number().int().min(1).max(1440).nullable().optional(),
});
export type ExerciseInput = z.input<typeof exerciseSchema>;

const workoutFields = {
  title: z.string().trim().min(1, 'Give the workout a title').max(150),
  type: z.enum(WORKOUT_TYPE_VALUES),
  startAt: instant,
  durationMinutes: z.number().int().min(1).max(1440),
  intensity: z.number().int().min(1).max(10).nullable(),
  notes,
  /** Replaces the whole exercise list when present. */
  exercises: z.array(exerciseSchema).max(50),
};

export const createWorkoutSchema = z.object({
  ...workoutFields,
  type: workoutFields.type.default('STRENGTH'),
  intensity: workoutFields.intensity.optional(),
  notes: notes.optional(),
  exercises: workoutFields.exercises.default([]),
});
export type CreateWorkoutInput = z.input<typeof createWorkoutSchema>;

export const updateWorkoutSchema = z
  .object(workoutFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateWorkoutInput = z.input<typeof updateWorkoutSchema>;

export const listWorkoutsQuerySchema = z.object({
  from: instant.optional(),
  to: instant.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListWorkoutsQuery = z.infer<typeof listWorkoutsQuerySchema>;

export const sportsSettingsSchema = z.object({ weeklyWorkoutTarget: z.number().int().min(0).max(14) });

// ─── Study ───────────────────────────────────────────────────────────────

export const chapterSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().trim().min(1).max(200),
  done: z.boolean().default(false),
});

const subjectFields = {
  name: z.string().trim().min(1, 'Name the subject').max(150),
  description: notes,
  color: hexColorSchema.nullable(),
  importance: prioritySchema,
  examDate: instant.nullable(),
  weeklyTargetMinutes: z.number().int().min(0).max(3000).nullable(),
  chapters: z.array(chapterSchema).max(200),
};

export const createSubjectSchema = z.object({
  ...subjectFields,
  description: notes.optional(),
  color: subjectFields.color.optional(),
  importance: prioritySchema.default('MEDIUM'),
  examDate: subjectFields.examDate.optional(),
  weeklyTargetMinutes: subjectFields.weeklyTargetMinutes.optional(),
  chapters: subjectFields.chapters.default([]),
});
export type CreateSubjectInput = z.input<typeof createSubjectSchema>;

export const updateSubjectSchema = z
  .object(subjectFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateSubjectInput = z.input<typeof updateSubjectSchema>;

export const createStudySessionSchema = z
  .object({
    subjectId: z.uuid(),
    kind: z.enum(['LEARNING', 'REVISION', 'EXAM']).default('LEARNING'),
    topic: z.string().trim().max(200).nullable().optional(),
    startAt: instant,
    endAt: instant,
    completed: z.boolean().default(false),
    /** Recall 0–5, required to complete a revision (drives spaced repetition). */
    quality: z.number().int().min(0).max(5).nullable().optional(),
    notes: notes.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.endAt <= v.startAt) ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'End must be after start' });
    if (v.kind === 'REVISION' && v.completed && (v.quality === null || v.quality === undefined)) {
      ctx.addIssue({ code: 'custom', path: ['quality'], message: 'Rate how well you remembered (0–5)' });
    }
    if (v.kind === 'REVISION' && !v.topic) ctx.addIssue({ code: 'custom', path: ['topic'], message: 'A revision needs a topic' });
  });
export type CreateStudySessionInput = z.input<typeof createStudySessionSchema>;

export const completeStudySessionSchema = z.object({
  quality: z.number().int().min(0).max(5).nullable().optional(),
  notes: notes.optional(),
});
export type CompleteStudySessionInput = z.input<typeof completeStudySessionSchema>;

// ─── Travel ──────────────────────────────────────────────────────────────

export const TRIP_STATUS_VALUES = ['PLANNING', 'BOOKED', 'ONGOING', 'COMPLETED', 'CANCELLED'] as const;

const checklistItem = z.object({ id: z.string().min(1).max(40), label: z.string().trim().min(1).max(200), done: z.boolean() });
/** References only (booking numbers, "passport in drawer") — never document scans or secrets. */
const documentRef = z.object({ label: z.string().trim().min(1).max(100), reference: z.string().trim().max(200) });

const tripFields = {
  title: z.string().trim().min(1, 'Name the trip').max(200),
  destination: z.string().trim().min(1, 'Where are you going?').max(200),
  departureAt: instant,
  returnAt: instant,
  timezone: timezoneSchema,
  status: z.enum(TRIP_STATUS_VALUES),
  transportation: z.string().trim().max(300).nullable(),
  accommodation: z.string().trim().max(300).nullable(),
  budgetAmount: z.number().min(0).max(1e9).nullable(),
  budgetCurrency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code').nullable(),
  companions: z.array(z.string().trim().min(1).max(80)).max(30),
  checklist: z.array(checklistItem).max(200),
  documents: z.array(documentRef).max(50),
  notes,
  blocksCalendar: z.boolean(),
};

function tripRules(v: { departureAt?: Date; returnAt?: Date }, ctx: z.RefinementCtx) {
  if (v.departureAt && v.returnAt && v.returnAt <= v.departureAt) {
    ctx.addIssue({ code: 'custom', path: ['returnAt'], message: 'Return must be after departure' });
  }
}

export const createTripSchema = z
  .object({
    ...tripFields,
    timezone: timezoneSchema.optional(),
    status: tripFields.status.default('PLANNING'),
    transportation: tripFields.transportation.optional(),
    accommodation: tripFields.accommodation.optional(),
    budgetAmount: tripFields.budgetAmount.optional(),
    budgetCurrency: tripFields.budgetCurrency.optional(),
    companions: tripFields.companions.default([]),
    checklist: tripFields.checklist.default([]),
    documents: tripFields.documents.default([]),
    notes: notes.optional(),
    blocksCalendar: z.boolean().default(true),
  })
  .superRefine(tripRules);
export type CreateTripInput = z.input<typeof createTripSchema>;

export const updateTripSchema = z
  .object(tripFields)
  .partial()
  .superRefine(tripRules)
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type UpdateTripInput = z.input<typeof updateTripSchema>;

export const tripActivitySchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: notes.optional(),
    location: z.string().trim().max(300).nullable().optional(),
    startAt: instant.nullable().optional(),
    endAt: instant.nullable().optional(),
    reservation: z.string().trim().max(200).nullable().optional(),
    cost: z.number().min(0).max(1e9).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.startAt && v.endAt && v.endAt <= v.startAt) ctx.addIssue({ code: 'custom', path: ['endAt'], message: 'End must be after start' });
  });
export type TripActivityInput = z.input<typeof tripActivitySchema>;

export const listTripsQuerySchema = z.object({ past: queryBool.optional() });

// ─── Analytics ───────────────────────────────────────────────────────────

export const analyticsQuerySchema = z.object({
  period: z.enum(['week', 'month']).default('week'),
  /** Any local date inside the period; defaults to today. */
  date: isoDateSchema.optional(),
});
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
