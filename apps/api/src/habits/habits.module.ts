/**
 * Phase 1 slice of the Habits module: check-off from the My Day dashboard.
 * Habit CRUD, custom frequencies and analytics arrive in Phase 2.
 */
import {
  Body,
  Controller,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { toggleHabitSchema, type ToggleHabitInput } from '@lifeos/validation';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators';
import { ApiZodBody } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HabitsService {
  constructor(private readonly prisma: PrismaService) {}

  async setCompletion(userId: string, habitId: string, input: ToggleHabitInput) {
    const habit = await this.prisma.habit.findFirst({ where: { id: habitId, userId } });
    if (!habit) throw new NotFoundException('Habit not found');
    const date = new Date(`${input.date}T00:00:00Z`);
    if (input.done) {
      await this.prisma.habitLog.upsert({
        where: { habitId_date: { habitId, date } },
        update: {},
        create: { habitId, userId, date },
      });
    } else {
      await this.prisma.habitLog.deleteMany({ where: { habitId, userId, date } });
    }
    return { habitId, date: input.date, done: input.done };
  }
}

@ApiTags('habits')
@Controller('habits')
export class HabitsController {
  constructor(private readonly habits: HabitsService) {}

  @Put(':id/completion')
  @ApiOperation({ summary: 'Mark a habit done / not done for a local date (idempotent)' })
  @ApiZodBody(toggleHabitSchema)
  setCompletion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(toggleHabitSchema)) body: ToggleHabitInput,
  ) {
    return this.habits.setCompletion(user.userId, id, body);
  }
}

@Module({ controllers: [HabitsController], providers: [HabitsService] })
export class HabitsModule {}
