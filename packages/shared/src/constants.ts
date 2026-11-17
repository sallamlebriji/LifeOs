export const DEFAULT_TIMEZONE = 'Africa/Casablanca';

export const SUPPORTED_LOCALES = ['en', 'fr'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: SupportedLocale = 'en';

export const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export type PriorityValue = (typeof PRIORITIES)[number];

export const TIMES_OF_DAY = ['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT', 'ANY'] as const;
export type TimeOfDayValue = (typeof TIMES_OF_DAY)[number];

export const THEMES = ['system', 'light', 'dark'] as const;
export type ThemeValue = (typeof THEMES)[number];

export const API_PREFIX = 'api/v1';

export const CATEGORY_KINDS = [
  'WORK',
  'PERSONAL',
  'SPORT',
  'STUDY',
  'TRAVEL',
  'HEALTH',
  'SOCIAL',
  'OTHER',
] as const;
export type CategoryKindValue = (typeof CATEGORY_KINDS)[number];

/** Categories created for every new account. Colours follow the design-system palette. */
export const DEFAULT_CATEGORIES: ReadonlyArray<{
  name: string;
  kind: CategoryKindValue;
  color: string;
  icon: string;
}> = [
  { name: 'Work', kind: 'WORK', color: '#0A84FF', icon: 'briefcase' },
  { name: 'Personal', kind: 'PERSONAL', color: '#BF5AF2', icon: 'user' },
  { name: 'Sport', kind: 'SPORT', color: '#30D158', icon: 'dumbbell' },
  { name: 'Study', kind: 'STUDY', color: '#FF9F0A', icon: 'book-open' },
  { name: 'Travel', kind: 'TRAVEL', color: '#64D2FF', icon: 'plane' },
  { name: 'Health', kind: 'HEALTH', color: '#FF375F', icon: 'heart' },
];
