import { Global, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfig } from '../config/app-config.service';

/**
 * Shared Redis connection (cache now; BullMQ queues reuse the URL in Phase 5).
 * Lazy: the API boots even when Redis is down, and /health reports it.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;

  constructor(config: AppConfig) {
    this.client = new Redis(config.get('REDIS_URL'), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.client.on('error', (err) => this.logger.warn(`Redis error: ${err.message}`));
  }

  async ping(): Promise<boolean> {
    try {
      if (this.client.status === 'wait' || this.client.status === 'end') await this.client.connect();
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    // quit() needs a writable connection; when Redis is down, drop the socket instead.
    if (this.client.status === 'ready') {
      await this.client.quit().catch(() => this.client.disconnect());
    } else if (this.client.status !== 'end') {
      this.client.disconnect();
    }
  }
}

@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class RedisModule {}
