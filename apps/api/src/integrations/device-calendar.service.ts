/**
 * Apple Calendar (and Android device calendars): the mobile app reads events
 * on-device with EventKit/CalendarContract and posts a snapshot of a window.
 * The server mirrors that window: upserts what it got, removes what vanished.
 * Imported events are FIXED and EXTERNAL, so the planner works around them.
 */
import { Injectable } from '@nestjs/common';
import { type IntegrationStatusDto } from '@lifeos/shared';
import { z } from '@lifeos/validation';
import { userTimezone } from '../common/module-helpers';
import { PrismaService } from '../prisma/prisma.service';

const instant = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

export const deviceImportSchema = z
  .object({
    from: instant,
    to: instant,
    events: z
      .array(
        z.object({
          externalId: z.string().min(1).max(255),
          title: z.string().trim().min(1).max(300),
          location: z.string().max(300).nullable().optional(),
          startAt: instant,
          endAt: instant,
          allDay: z.boolean().default(false),
        }),
      )
      .max(1000),
  })
  .refine((v) => v.to > v.from && v.to.getTime() - v.from.getTime() <= 120 * 86_400_000, { path: ['to'], message: 'Window must be positive and at most 120 days' });
export type DeviceImport = z.output<typeof deviceImportSchema>;

@Injectable()
export class DeviceCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async status(userId: string): Promise<IntegrationStatusDto> {
    const row = await this.prisma.integration.findFirst({ where: { userId, provider: 'APPLE_CALENDAR' } });
    return {
      provider: 'APPLE_CALENDAR',
      available: false,
      unavailableReason: row ? null : 'Apple Calendar has no web API. Import it from the LifeOS iOS app (Settings → Apple Calendar).',
      connected: !!row,
      account: row ? 'This iPhone' : null,
      status: row?.status ?? null,
      lastSyncedAt: row?.lastSyncedAt?.toISOString() ?? null,
      lastSync: null,
    };
  }

  async import(userId: string, input: DeviceImport) {
    const { timezone } = await userTimezone(this.prisma, userId);
    const integration =
      (await this.prisma.integration.findFirst({ where: { userId, provider: 'APPLE_CALENDAR' } })) ??
      (await this.prisma.integration.create({ data: { userId, provider: 'APPLE_CALENDAR', status: 'CONNECTED', externalAccountId: 'device' } }));
    const log = await this.prisma.syncLog.create({ data: { integrationId: integration.id, direction: 'IMPORT' } });
    const valid = input.events.filter((e) => e.endAt > e.startAt);
    let imported = 0;
    for (const e of valid) {
      const data = { title: e.title, location: e.location ?? null, startAt: e.startAt, endAt: e.endAt, allDay: e.allDay };
      const existing = await this.prisma.calendarEvent.findUnique({
        where: { integrationId_externalId: { integrationId: integration.id, externalId: e.externalId } },
        select: { title: true, location: true, startAt: true, endAt: true, allDay: true },
      });
      const same =
        existing &&
        existing.title === data.title &&
        existing.location === data.location &&
        existing.allDay === data.allDay &&
        existing.startAt.getTime() === data.startAt.getTime() &&
        existing.endAt.getTime() === data.endAt.getTime();
      if (same) continue;
      await this.prisma.calendarEvent.upsert({
        where: { integrationId_externalId: { integrationId: integration.id, externalId: e.externalId } },
        update: { ...data, version: { increment: 1 } },
        create: { ...data, userId, integrationId: integration.id, externalId: e.externalId, source: 'EXTERNAL', flexibility: 'FIXED', timezone },
      });
      imported++;
    }
    const { count: removed } = await this.prisma.calendarEvent.deleteMany({
      where: {
        userId,
        integrationId: integration.id,
        source: 'EXTERNAL',
        startAt: { gte: input.from, lt: input.to },
        externalId: { notIn: valid.map((e) => e.externalId) },
      },
    });
    await this.prisma.integration.update({ where: { id: integration.id }, data: { lastSyncedAt: new Date(), status: 'CONNECTED' } });
    await this.prisma.syncLog.update({ where: { id: log.id }, data: { status: 'SUCCESS', itemsProcessed: imported + removed, finishedAt: new Date() } });
    return { imported, removed };
  }

  /** Removes the device link and the events it imported. */
  async disconnect(userId: string) {
    const row = await this.prisma.integration.findFirst({ where: { userId, provider: 'APPLE_CALENDAR' } });
    if (!row) return;
    await this.prisma.$transaction([
      this.prisma.calendarEvent.deleteMany({ where: { userId, integrationId: row.id } }),
      this.prisma.integration.delete({ where: { id: row.id } }),
    ]);
  }
}
