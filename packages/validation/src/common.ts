import { isValidTimeZone, PRIORITIES, SUPPORTED_LOCALES, THEMES, TIMES_OF_DAY } from '@lifeos/shared';
import { z } from 'zod';

export const uuidSchema = z.uuid();

export const clockSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Use the HH:mm 24-hour format');

export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimeZone, 'Unknown IANA timezone');

export const localeSchema = z.enum(SUPPORTED_LOCALES);
export const themeSchema = z.enum(THEMES);
export const prioritySchema = z.enum(PRIORITIES);
export const timeOfDaySchema = z.enum(TIMES_OF_DAY);
export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #RRGGBB colour');

/** ISO date "YYYY-MM-DD". */
export const isoDateSchema = z.iso.date();

export const paginationQuerySchema = z.object({
  cursor: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
