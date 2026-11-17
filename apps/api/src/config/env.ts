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
  MAIL_TRANSPORT: z.enum(['log']).default('log'),
  APP_TIMEZONE: z.string().default('Africa/Casablanca'),
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
  return result.data;
}
