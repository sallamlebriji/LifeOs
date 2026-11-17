import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { AppConfig } from './app-config.service';
import { validateEnv } from './env';

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      // The monorepo keeps a single .env at the repository root.
      envFilePath: [join(__dirname, '../../../../.env'), join(process.cwd(), '.env')],
      validate: validateEnv,
      cache: true,
    }),
  ],
  providers: [AppConfig],
  exports: [AppConfig],
})
export class AppConfigModule {}
