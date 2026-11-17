import { PrismaClient } from '@prisma/client';

export * from '@prisma/client';

/**
 * Creates a Prisma client. Apps own the client lifecycle (NestJS wraps it in a
 * provider); this helper only centralises defaults.
 */
export function createPrismaClient(url?: string): PrismaClient {
  return new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}
