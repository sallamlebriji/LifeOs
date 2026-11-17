import { describe, expect, it } from 'vitest';
import { registerSchema, resetPasswordSchema } from './auth';
import { quickAddTaskSchema } from './dashboard';
import { schedulingWeightsSchema, updatePreferencesSchema, updateProfileSchema } from './user';

describe('auth schemas', () => {
  it('normalises email and accepts a valid registration', () => {
    const parsed = registerSchema.parse({
      email: '  Alex@Example.COM ',
      password: 'correct horse 42',
      displayName: 'Alex',
    });
    expect(parsed.email).toBe('alex@example.com');
  });

  it('rejects weak passwords', () => {
    const res = registerSchema.safeParse({ email: 'a@b.co', password: 'short1', displayName: 'A' });
    expect(res.success).toBe(false);
    const noDigit = registerSchema.safeParse({
      email: 'a@b.co',
      password: 'onlylettershere',
      displayName: 'A',
    });
    expect(noDigit.success).toBe(false);
  });

  it('rejects unknown timezones', () => {
    const res = registerSchema.safeParse({
      email: 'a@b.co',
      password: 'longenough123',
      displayName: 'A',
      timezone: 'Mars/Olympus',
    });
    expect(res.success).toBe(false);
  });

  it('strips control characters from display names', () => {
    const parsed = registerSchema.parse({
      email: 'a@b.co',
      password: 'longenough123',
      displayName: 'Al\u0007ex',
    });
    expect(parsed.displayName).toBe('Alex');
  });

  it('requires a token of plausible length for reset', () => {
    expect(resetPasswordSchema.safeParse({ token: 'x', password: 'longenough123' }).success).toBe(false);
  });
});

describe('preferences schema', () => {
  it('accepts a partial update', () => {
    expect(updatePreferencesSchema.parse({ timezone: 'Europe/Paris' })).toEqual({
      timezone: 'Europe/Paris',
    });
  });

  it('rejects inverted working hours', () => {
    const res = updatePreferencesSchema.safeParse({ workStartTime: '18:00', workEndTime: '09:00' });
    expect(res.success).toBe(false);
  });

  it('rejects duplicate work days', () => {
    expect(updatePreferencesSchema.safeParse({ workDays: [1, 1, 2] }).success).toBe(false);
  });

  it('requires scheduling weights to sum to 1', () => {
    expect(
      schedulingWeightsSchema.safeParse({
        priority: 0.5,
        urgency: 0.5,
        goalImportance: 0.5,
        timeSlotFit: 0,
        sessionContinuity: 0,
      }).success,
    ).toBe(false);
  });
});

describe('profile schema', () => {
  it('rejects an empty update and non-https avatars', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
    expect(updateProfileSchema.safeParse({ avatarUrl: 'javascript:alert(1)' }).success).toBe(false);
  });
});

describe('quick add', () => {
  it('defaults priority to MEDIUM', () => {
    expect(quickAddTaskSchema.parse({ title: 'Call the bank' }).priority).toBe('MEDIUM');
  });
});
