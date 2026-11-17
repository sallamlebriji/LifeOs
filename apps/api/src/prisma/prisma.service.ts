import { Global, Injectable, Module, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@lifeos/database';
import { AppConfig } from '../config/app-config.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: AppConfig) {
    super({
      datasources: { db: { url: config.get('DATABASE_URL') } },
      log: config.get('NODE_ENV') === 'development' ? ['warn', 'error'] : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
