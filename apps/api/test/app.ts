import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';

export const WEB = { 'X-LifeOS-Client': 'web' };

export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return {
    app,
    http: () => request(app.getHttpServer()),
    prisma: app.get(PrismaService),
    mail: app.get(MailService),
  };
}

/** Wipes user-owned data between suites (cascade from User covers everything else). */
export async function resetDatabase(prisma: PrismaService) {
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
}

let counter = 0;
export function uniqueEmail(prefix = 'user') {
  counter += 1;
  return `${prefix}.${Date.now()}.${counter}@example.test`;
}

/** Extracts `name=value` pairs from Set-Cookie headers. */
export function cookiesFrom(res: request.Response): Record<string, string> {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const jar: Record<string, string> = {};
  for (const c of raw ?? []) {
    const [pair] = c.split(';');
    const [name, ...rest] = pair!.split('=');
    jar[name!.trim()] = rest.join('=');
  }
  return jar;
}

export function tokenFromMail(text: string): string {
  const match = /token=([A-Za-z0-9_-]+)/.exec(text);
  if (!match) throw new Error('No token in email');
  return match[1]!;
}
