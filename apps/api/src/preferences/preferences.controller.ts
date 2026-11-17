import { BadRequestException, Body, Controller, Get, Injectable, Module, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@lifeos/database';
import { type UserPreferencesDto } from '@lifeos/shared';
import { updatePreferencesSchema, type UpdatePreferencesInput } from '@lifeos/validation';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators';
import { ApiZodBody } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { toPreferencesDto } from '../users/user.serializer';

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Preferences are created at registration; upsert keeps legacy rows safe. */
  async get(userId: string): Promise<UserPreferencesDto> {
    const prefs = await this.prisma.userPreferences.upsert({
      where: { userId },
      update: {},
      create: { userId, workDays: [1, 2, 3, 4, 5] },
    });
    return toPreferencesDto(prefs);
  }

  async update(userId: string, input: UpdatePreferencesInput): Promise<UserPreferencesDto> {
    const current = await this.get(userId);
    // Cross-field checks against stored values for partial updates.
    const merged = { ...current, ...input };
    const toMin = (c: string) => Number(c.slice(0, 2)) * 60 + Number(c.slice(3, 5));
    if (toMin(merged.dayStartTime) >= toMin(merged.dayEndTime)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        issues: { dayEndTime: ['Day must end after it starts'] },
      });
    }
    if (toMin(merged.workStartTime) >= toMin(merged.workEndTime)) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Validation failed',
        issues: { workEndTime: ['Work must end after it starts'] },
      });
    }
    const { schedulingWeights, ...rest } = input;
    const data: Prisma.UserPreferencesUpdateInput = {
      ...rest,
      ...(schedulingWeights !== undefined
        ? { schedulingWeights: schedulingWeights === null ? Prisma.DbNull : schedulingWeights }
        : {}),
    };
    const prefs = await this.prisma.userPreferences.update({ where: { userId }, data });
    return toPreferencesDto(prefs);
  }
}

@ApiTags('preferences')
@Controller('preferences')
export class PreferencesController {
  constructor(private readonly prefs: PreferencesService) {}

  @Get()
  @ApiOperation({ summary: 'Get your preferences' })
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.prefs.get(user.userId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update your preferences (partial)' })
  @ApiZodBody(updatePreferencesSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updatePreferencesSchema)) body: UpdatePreferencesInput,
  ) {
    return this.prefs.update(user.userId, body);
  }
}

@Module({
  controllers: [PreferencesController],
  providers: [PreferencesService],
  exports: [PreferencesService],
})
export class PreferencesModule {}
