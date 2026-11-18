/**
 * Background jobs on BullMQ (Redis). Enabled with JOBS_ENABLED=true:
 *   - "reminders" every minute: generate and deliver notifications
 *   - "calendar-sync" every 15 minutes: Google Calendar import/export
 * Repeatable jobs are keyed, so several API instances don't duplicate them,
 * and BullMQ's locking means each run is processed by one worker.
 */
import { Injectable, Logger, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { AppConfig } from '../config/app-config.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { GoogleCalendarService } from '../integrations/google-calendar.service';
import { NotificationsModule, NotificationsService } from '../notifications/notifications.module';

const QUEUE = 'lifeos';

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Jobs');
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly notifications: NotificationsService,
    private readonly google: GoogleCalendarService,
  ) {}

  async onModuleInit() {
    if (!this.config.get('JOBS_ENABLED')) {
      this.logger.log('Background jobs disabled (JOBS_ENABLED=false): email/push reminders and periodic calendar sync will not run.');
      return;
    }
    const url = new URL(this.config.get('REDIS_URL'));
    const connection = {
      host: url.hostname,
      port: Number(url.port || 6379),
      ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
      maxRetriesPerRequest: null,
    };
    this.queue = new Queue(QUEUE, { connection });
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        if (job.name === 'reminders') return this.notifications.runAll();
        if (job.name === 'calendar-sync') return this.google.syncAll();
        return null;
      },
      { connection, concurrency: 1 },
    );
    this.worker.on('failed', (job, err) => this.logger.warn(`Job ${job?.name} failed: ${err.message}`));
    try {
      await this.queue.upsertJobScheduler('reminders', { every: 60_000 }, { name: 'reminders', opts: { removeOnComplete: 100, removeOnFail: 100 } });
      await this.queue.upsertJobScheduler('calendar-sync', { every: 15 * 60_000 }, { name: 'calendar-sync', opts: { removeOnComplete: 50, removeOnFail: 50 } });
      this.logger.log('Background jobs scheduled: reminders (1 min), calendar-sync (15 min).');
    } catch (err) {
      this.logger.error(`Could not schedule jobs — is Redis reachable at REDIS_URL? ${err instanceof Error ? err.message : err}`);
    }
  }

  async onModuleDestroy() {
    await this.worker?.close().catch(() => undefined);
    await this.queue?.close().catch(() => undefined);
  }
}

@Module({ imports: [NotificationsModule, IntegrationsModule], providers: [JobsService] })
export class JobsModule {}
