/**
 * Notifications: reminders are generated from the user's events, deadlines and
 * habits (deduplicated), then delivered in-app, by email (opt-in) and by Expo
 * push to registered devices. In-app reminders are also generated when the list
 * is read, so they work even without the background worker; email and push
 * need the worker (JOBS_ENABLED + Redis).
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Prisma } from '@lifeos/database';
import { DEFAULT_TIMEZONE, type NotificationDto } from '@lifeos/shared';
import { z } from '@lifeos/validation';
import { CalendarModule, CalendarService, occurrencesIn } from '../calendar/calendar.module';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators';
import { fromDateOnly } from '../common/module-helpers';
import { ApiZodBody } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { reminderCandidates } from './reminders';

const HORIZON_MINUTES = 24 * 60;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export const deviceSchema = z.object({
  token: z.string().regex(/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/, 'Not an Expo push token'),
  platform: z.enum(['ios', 'android']),
});
type DeviceInput = z.infer<typeof deviceSchema>;

function toDto(n: { id: string; type: string; title: string; body: string | null; entityType: string | null; entityId: string | null; scheduledFor: Date | null; readAt: Date | null; createdAt: Date }): NotificationDto {
  return {
    id: n.id,
    type: n.type as NotificationDto['type'],
    title: n.title,
    body: n.body,
    entityType: n.entityType,
    entityId: n.entityId,
    at: (n.scheduledFor ?? n.createdAt).toISOString(),
    read: !!n.readAt,
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  /** Injected in tests to observe push requests. */
  fetchImpl: typeof fetch = fetch;

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: CalendarService,
    private readonly mail: MailService,
  ) {}

  /** Creates any missing reminders for the next 24 hours. Idempotent (dedupe keys). */
  async generate(userId: string, now = new Date()) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferences: true, devices: { select: { id: true }, take: 1 } },
    });
    const prefs = user?.preferences;
    if (!user || !prefs?.notificationsEnabled) return 0;
    const tz = prefs.timezone ?? DEFAULT_TIMEZONE;
    const range = { start: now, end: new Date(now.getTime() + HORIZON_MINUTES * 60_000) };
    const [rows, tasks, habits] = await Promise.all([
      this.calendar.rowsFor(userId, range),
      this.prisma.task.findMany({
        where: { userId, status: { in: ['TODO', 'IN_PROGRESS'] }, dueAt: { gt: range.start, lte: range.end } },
        select: { id: true, title: true, dueAt: true },
      }),
      this.prisma.habit.findMany({
        where: { userId, archivedAt: null, reminderTime: { not: null } },
        include: { logs: { where: { date: { gte: new Date(now.getTime() - 2 * 86_400_000) } }, select: { date: true } } },
      }),
    ]);
    const candidates = reminderCandidates({
      now,
      horizonMinutes: HORIZON_MINUTES,
      timezone: tz,
      eventReminderMinutes: prefs.eventReminderMinutes,
      events: occurrencesIn(rows, range).map((e) => ({ id: e.id, title: e.title, start: new Date(e.startAt), allDay: e.allDay, location: e.location })),
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, dueAt: t.dueAt! })),
      habits: habits.map((h) => ({
        id: h.id,
        name: h.name,
        reminderTime: h.reminderTime!,
        frequency: h.frequency,
        daysOfWeek: Array.isArray(h.daysOfWeek) ? (h.daysOfWeek as number[]) : null,
        timesPerWeek: h.timesPerWeek,
        doneDates: h.logs.map((l) => fromDateOnly(l.date)!),
      })),
    });
    const channels: Array<{ channel: 'IN_APP' | 'EMAIL' | 'PUSH'; suffix: string }> = [
      { channel: 'IN_APP', suffix: '' },
      ...(prefs.emailReminders ? [{ channel: 'EMAIL' as const, suffix: ':email' }] : []),
      ...(user.devices.length ? [{ channel: 'PUSH' as const, suffix: ':push' }] : []),
    ];
    const data: Prisma.NotificationCreateManyInput[] = candidates.flatMap((c) =>
      channels.map(({ channel, suffix }) => ({
        userId,
        type: c.type,
        channel,
        title: c.title,
        body: c.body,
        entityType: c.entityType,
        entityId: c.entityId,
        scheduledFor: c.scheduledFor,
        dedupeKey: `${userId}:${c.dedupeKey}${suffix}`,
      })),
    );
    if (!data.length) return 0;
    const { count } = await this.prisma.notification.createMany({ data, skipDuplicates: true });
    return count;
  }

  /** Delivers due notifications. In-app ones just become visible. */
  async dispatch(now = new Date(), userId?: string, channel?: 'IN_APP') {
    const due = await this.prisma.notification.findMany({
      where: { sentAt: null, scheduledFor: { lte: now }, ...(userId ? { userId } : {}), ...(channel ? { channel } : {}) },
      include: { user: { select: { email: true, devices: { select: { token: true } } } } },
      orderBy: { scheduledFor: 'asc' },
      take: 200,
    });
    let delivered = 0;
    for (const n of due) {
      // A habit reminder whose habit was done in the meantime is dropped, not sent.
      if (n.type === 'HABIT_REMINDER' && n.entityId && n.scheduledFor) {
        const doneSince = await this.prisma.habitLog.count({ where: { habitId: n.entityId, createdAt: { gte: new Date(n.scheduledFor.getTime() - 86_400_000) } } });
        if (doneSince) {
          await this.prisma.notification.delete({ where: { id: n.id } });
          continue;
        }
      }
      try {
        if (n.channel === 'EMAIL') {
          await this.mail.send({ to: n.user.email, subject: `LifeOS: ${n.title}`, text: `${n.title}\n${n.body ?? ''}\n\n${this.mail.webUrl('/today')}` });
        } else if (n.channel === 'PUSH') {
          await this.push(n.user.devices.map((d) => d.token), n.title, n.body);
        }
        await this.prisma.notification.update({ where: { id: n.id }, data: { sentAt: now, error: null } });
        delivered++;
      } catch (err) {
        // Give up after an hour so a broken channel can't loop forever.
        const stale = n.scheduledFor && now.getTime() - n.scheduledFor.getTime() > 3_600_000;
        await this.prisma.notification.update({
          where: { id: n.id },
          data: { error: (err instanceof Error ? err.message : 'Delivery failed').slice(0, 300), ...(stale ? { sentAt: now } : {}) },
        });
        this.logger.warn(`Notification ${n.id} (${n.channel}) failed: ${err instanceof Error ? err.message : err}`);
      }
    }
    return delivered;
  }

  private async push(tokens: string[], title: string, body: string | null) {
    if (!tokens.length) return;
    const res = await this.fetchImpl(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(tokens.map((to) => ({ to, title, body: body ?? undefined, sound: 'default' }))),
    });
    if (!res.ok) throw new Error(`Push service answered ${res.status}`);
    const json = (await res.json().catch(() => ({}))) as { data?: Array<{ status: string; details?: { error?: string } }> };
    // Forget devices Expo says are gone.
    const gone = tokens.filter((_, i) => json.data?.[i]?.details?.error === 'DeviceNotRegistered');
    if (gone.length) await this.prisma.deviceToken.deleteMany({ where: { token: { in: gone } } });
  }

  /** Worker entry point: every user with notifications on. */
  async runAll(now = new Date()) {
    const users = await this.prisma.userPreferences.findMany({ where: { notificationsEnabled: true }, select: { userId: true } });
    let created = 0;
    for (const u of users) created += await this.generate(u.userId, now);
    const delivered = await this.dispatch(now);
    return { created, delivered };
  }

  async list(userId: string) {
    await this.generate(userId);
    // Only in-app here; email and push are delivered by the background worker.
    await this.dispatch(new Date(), userId, 'IN_APP');
    const where = { userId, channel: 'IN_APP' as const, sentAt: { not: null } };
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where, orderBy: { scheduledFor: 'desc' }, take: 50 }),
      this.prisma.notification.count({ where: { ...where, readAt: null } }),
    ]);
    return { items: items.map(toDto), unread };
  }

  async markRead(userId: string, id: string) {
    const { count } = await this.prisma.notification.updateMany({ where: { id, userId }, data: { readAt: new Date() } });
    if (count === 0) throw new NotFoundException('Notification not found');
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, readAt: null, sentAt: { not: null } }, data: { readAt: new Date() } });
  }

  async registerDevice(userId: string, input: DeviceInput) {
    // A token moves with the device: re-registering under another account reassigns it.
    await this.prisma.deviceToken.upsert({
      where: { token: input.token },
      update: { userId, platform: input.platform, lastSeenAt: new Date() },
      create: { userId, token: input.token, platform: input.platform },
    });
  }

  async removeDevice(userId: string, token: string) {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
  }
}

@ApiTags('notifications')
@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get('notifications')
  @ApiOperation({ summary: 'In-app notifications (generates due reminders first) with the unread count' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.list(user.userId);
  }

  @Post('notifications/:id/read')
  @HttpCode(204)
  async read(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.notifications.markRead(user.userId, id);
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  async readAll(@CurrentUser() user: AuthenticatedUser) {
    await this.notifications.markAllRead(user.userId);
  }

  @Post('devices')
  @HttpCode(204)
  @ApiOperation({ summary: 'Register an Expo push token for this account' })
  @ApiZodBody(deviceSchema)
  async register(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(deviceSchema)) body: DeviceInput) {
    await this.notifications.registerDevice(user.userId, body);
  }

  @Delete('devices/:token')
  @HttpCode(204)
  async unregister(@CurrentUser() user: AuthenticatedUser, @Param('token') token: string) {
    await this.notifications.removeDevice(user.userId, token);
  }
}

@Module({
  imports: [CalendarModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
