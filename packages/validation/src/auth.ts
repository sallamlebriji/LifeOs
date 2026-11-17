import { z } from 'zod';
import { localeSchema, timezoneSchema } from './common';

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address'));

/**
 * Password policy: 10–128 chars, at least one letter and one digit.
 * Length matters far more than character classes (NIST SP 800-63B).
 */
export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Include at least one letter and one number');

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, 'Tell us what to call you')
  .max(80)
  // Strip control characters; we render as text, never as HTML.
  // eslint-disable-next-line no-control-regex -- matching control chars is the point
  .transform((v) => v.replace(/[\u0000-\u001F\u007F]/g, ''));

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  timezone: timezoneSchema.optional(),
  locale: localeSchema.optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

const tokenSchema = z.string().min(20).max(200);

export const verifyEmailSchema = z.object({ token: tokenSchema });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ token: tokenSchema, password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Mobile clients send the refresh token in the body; web uses an httpOnly cookie. */
export const refreshSchema = z.object({ refreshToken: tokenSchema.optional() });
export type RefreshInput = z.infer<typeof refreshSchema>;
