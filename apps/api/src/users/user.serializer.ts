import { type User, type UserPreferences } from '@lifeos/database';
import { type PublicUser, type UserPreferencesDto } from '@lifeos/shared';

/** Explicit allow-list: never spread a User row into a response. */
export function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    emailVerified: user.emailVerifiedAt !== null,
    createdAt: user.createdAt.toISOString(),
  };
}

export function toPreferencesDto(p: UserPreferences): UserPreferencesDto {
  return {
    timezone: p.timezone,
    locale: p.locale === 'fr' ? 'fr' : 'en',
    theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : 'system',
    weekStartsOn: p.weekStartsOn,
    dayStartTime: p.dayStartTime,
    dayEndTime: p.dayEndTime,
    workStartTime: p.workStartTime,
    workEndTime: p.workEndTime,
    workDays: Array.isArray(p.workDays) ? (p.workDays as number[]) : [],
    bufferMinutes: p.bufferMinutes,
    minSessionMinutes: p.minSessionMinutes,
    maxDailyFocusMinutes: p.maxDailyFocusMinutes,
    preferredFocusTime: p.preferredFocusTime,
    schedulingWeights: (p.schedulingWeights as Record<string, number> | null) ?? null,
    notificationsEnabled: p.notificationsEnabled,
  };
}
