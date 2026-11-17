import { type INestApplication, VersioningType } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { CLIENT_HEADER } from './auth/cookies';
import { AppConfig } from './config/app-config.service';

/** Shared HTTP setup for the real server and for e2e tests. */
export function configureApp(app: NestExpressApplication): INestApplication {
  const config = app.get(AppConfig);

  app.set('trust proxy', 'loopback');
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '256kb' });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.enableCors({
    origin: [config.get('WEB_ORIGIN')],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', CLIENT_HEADER],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });

  if (!config.isProduction) {
    const doc = new DocumentBuilder()
      .setTitle('LifeOS API')
      .setDescription('LifeOS personal operating system — REST API v1')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('lifeos_at')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  }

  app.enableShutdownHooks();
  return app;
}
