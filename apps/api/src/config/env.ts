import { z } from '@lifeos/validation';

/** Environment contract for the API. Validated once at boot; the app refuses to start on error. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4010),
  API_PUBLIC_URL: z.url().default('http://localhost:4010'),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().startsWith('mysql://', 'DATABASE_URL must be a MySQL connection URL'),
  REDIS_URL: z.string().startsWith('redis://').default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  MAIL_TRANSPORT: z.enum(['log', 'smtp']).default('log'),
  /** smtp(s)://user:pass@host:port — required when MAIL_TRANSPORT=smtp. */
  SMTP_URL: z.string().default(''),
  MAIL_FROM: z.string().default('LifeOS <no-reply@lifeos.local>'),
  APP_TIMEZONE: z.string().default('Africa/Casablanca'),
  // AI planner (optional). Without these the planner works from the structured
  // form only, and the chat endpoint answers 503 "not configured".
  AI_PROVIDER: z.enum(['openai', '']).default(''),
  AI_MODEL: z.string().max(100).default(''),
  OPENAI_API_KEY: z.string().max(500).default(''),
  OPENAI_BASE_URL: z.union([z.url(), z.literal('')]).default(''),
  PROPOSAL_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  // Background jobs (BullMQ on REDIS_URL): reminders and calendar sync.
  JOBS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  // 32 random bytes, base64. Required to connect integrations (credentials are encrypted at rest).
  INTEGRATION_ENCRYPTION_KEY: z.string().default(''),
  GOOGLE_CLIENT_ID: z.string().default(''),
  GOOGLE_CLIENT_SECRET: z.string().default(''),
  /** Must match the OAuth client's redirect URI, e.g. http://localhost:3000/api/v1/integrations/google/callback */
  GOOGLE_REDIRECT_URI: z.union([z.url(), z.literal('')]).default(''),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${details.join('\n')}`);
  }
  if (result.data.NODE_ENV === 'production' && !result.data.COOKIE_SECURE) {
    throw new Error('COOKIE_SECURE must be true in production');
  }
  if (result.data.MAIL_TRANSPORT === 'smtp' && !result.data.SMTP_URL) {
    throw new Error('SMTP_URL is required when MAIL_TRANSPORT=smtp');
  }
  if (result.data.NODE_ENV === 'production' && result.data.MAIL_TRANSPORT === 'log') {
    throw new Error('MAIL_TRANSPORT=log is for development only; configure SMTP in production');
  }
  return result.data;
}
