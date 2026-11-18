import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.service';
import { AuthModule } from './auth/auth.module';
import { CalendarModule } from './calendar/calendar.module';
import { CategoriesModule } from './categories/categories.module';
import { CsrfGuard, JwtAuthGuard, RolesGuard } from './auth/guards';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { AppConfigModule } from './config/app-config.module';
import { MyDayModule } from './dashboard/my-day.module';
import { GoalsModule } from './goals/goals.module';
import { HabitsModule } from './habits/habits.module';
import { HealthModule } from './health/health.controller';
import { MailModule } from './mail/mail.service';
import { PreferencesModule } from './preferences/preferences.controller';
import { PrismaModule } from './prisma/prisma.service';
import { ProjectsModule } from './projects/projects.module';
import { RedisModule } from './redis/redis.service';
import { TasksModule } from './tasks/tasks.module';
import { UsersModule } from './users/users.controller';

@Module({
  imports: [
    AppConfigModule,
    // Default: 300 requests / minute / IP. Sensitive routes override with @Throttle.
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
      // Integration tests hammer auth endpoints from one IP; they opt in explicitly.
      skipIf: () =>
        process.env.NODE_ENV === 'test' && process.env.ENABLE_THROTTLE_IN_TEST !== 'true',
    }),
    PrismaModule,
    RedisModule,
    AuditModule,
    MailModule,
    HealthModule,
    AuthModule,
    UsersModule,
    PreferencesModule,
    MyDayModule,
    CategoriesModule,
    TasksModule,
    GoalsModule,
    ProjectsModule,
    CalendarModule,
    HabitsModule,
  ],
  providers: [
    // Order matters: rate-limit → CSRF → authenticate → authorise.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: CsrfGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: RolesGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
