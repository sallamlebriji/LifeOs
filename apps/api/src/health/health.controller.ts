import { Controller, Get, HttpStatus, Module, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { type Response } from 'express';
import { Public } from '../common/decorators';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  @ApiOperation({ summary: 'Liveness + dependency check (MySQL, Redis)' })
  async check(@Res({ passthrough: true }) res: Response) {
    const [mysql, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.ping(),
    ]);
    // MySQL is required; Redis is degraded-but-up until background jobs land.
    const status = mysql ? (redis ? 'ok' : 'degraded') : 'down';
    if (!mysql) res.status(HttpStatus.SERVICE_UNAVAILABLE);
    return { status, checks: { mysql, redis }, time: new Date().toISOString() };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
