import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { AppConfig } from './config/app-config.service';

async function main() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  configureApp(app);
  const config = app.get(AppConfig);
  const port = config.get('API_PORT');
  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.log(`LifeOS API listening on http://localhost:${port}/api/v1`);
  // Timezone rules change (e.g. Morocco, Sept 2026): keep the runtime's tzdata current.
  logger.log(`Timezone database: tzdata ${process.versions.tz ?? 'unknown'} (ICU ${process.versions.icu ?? '?'})`);
  if (!config.isProduction) logger.log(`OpenAPI docs: http://localhost:${port}/api/docs`);
}

void main();
