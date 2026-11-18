/**
 * Habits: CRUD, archive, custom frequencies (days of week or N times a week),
 * reminder time, daily check-off and statistics (streaks, 28-day consistency).
 *
 * Reminders are stored here; delivery (push/email) ships with notifications in Phase 5.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Prisma } from '@lifeos/database';
import { addDaysKey, type HabitDto, habitStats, localDateKey } from '@lifeos/shared';
import {
  createHabitSchema,
  listHabitsQuerySchema,
  type ListHabitsQuery,
  toggleHabitSchema,
  type ToggleHabitInput,
  updateHabitSchema,
  type z,
} from '@lifeos/validation';
import { AuditService } from '../audit/audit.service';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators';
import { assertOwnedRefs, categorySelect, fromDateOnly, userTimezone } from '../common/module-helpers';
import { ApiZodBody, ApiZodQuery } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

type CreateHabit = z.output<typeof createHabitSchema>;
type UpdateHabit = z.output<typeof updateHabitSchema>;

const habitInclude = { category: categorySelect } satisfies Prisma.HabitInclude;
type HabitRow = Prisma.HabitGetPayload<{ include: typeof habitInclude }>;

function days(value: Prisma.JsonValue | null): number[] | null {
  return Array.isArray(value) ? (value as number[]) : null;
}

/** Stats need every completion since creation; capped to two years. */
const STATS_LOOKBACK_DAYS = 730;

@Injectable()
export class HabitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toDto(h: HabitRow, completed: string[], today: string, timezone: string, weekStartsOn: number, windowDays: number): HabitDto {
    const schedule = { frequency: h.frequency, daysOfWeek: days(h.daysOfWeek), timesPerWeek: h.timesPerWeek };
    const since = addDaysKey(today, -(windowDays - 1));
    const stats = habitStats({
      schedule,
      completedDates: completed,
      today,
      weekStartsOn,
      createdOn: localDateKey(h.createdAt, timezone),
    });
    return {
      id: h.id,
      name: h.name,
      description: h.description,
      frequency: h.frequency,
      daysOfWeek: schedule.daysOfWeek,
      timesPerWeek: h.timesPerWeek,
      targetPerDay: h.targetPerDay,
      reminderTime: h.reminderTime,
      color: h.color,
      icon: h.icon,
      archived: !!h.archivedAt,
      category: h.category,
      stats: {
        currentStreak: stats.currentStreak,
        longestStreak: stats.longestStreak,
        consistency28: stats.consistency28,
        completedThisWeek: stats.completedThisWeek,
        dueThisWeek: stats.dueThisWeek,
        totalCompletions: stats.totalCompletions,
      },
      recent: completed.filter((d) => d >= since),
    };
  }

  private async build(userId: string, rows: HabitRow[], windowDays: number): Promise<HabitDto[]> {
    const { timezone, weekStartsOn } = await userTimezone(this.prisma, userId);
    const today = localDateKey(new Date(), timezone);
    const logs = rows.length
      ? await this.prisma.habitLog.findMany({
          where: {
            userId,
            habitId: { in: rows.map((h) => h.id) },
            date: { gte: new Date(`${addDaysKey(today, -STATS_LOOKBACK_DAYS)}T00:00:00Z`) },
          },
          select: { habitId: true, date: true },
          orderBy: { date: 'asc' },
        })
      : [];
    const byHabit = new Map<string, string[]>();
    for (const l of logs) (byHabit.get(l.habitId) ?? byHabit.set(l.habitId, []).get(l.habitId)!).push(fromDateOnly(l.date)!);
    return rows.map((h) => this.toDto(h, byHabit.get(h.id) ?? [], today, timezone, weekStartsOn, windowDays));
  }

  async list(userId: string, q: ListHabitsQuery): Promise<HabitDto[]> {
    const rows = await this.prisma.habit.findMany({
      where: { userId, archivedAt: q.archived ? { not: null } : null },
      include: habitInclude,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 200,
    });
    return this.build(userId, rows, q.days);
  }

  async get(userId: string, id: string, windowDays = 28): Promise<HabitDto> {
    const row = await this.prisma.habit.findFirst({ where: { id, userId }, include: habitInclude });
    if (!row) throw new NotFoundException('Habit not found');
    return (await this.build(userId, [row], windowDays))[0]!;
  }

  async create(userId: string, input: CreateHabit) {
    await assertOwnedRefs(this.prisma, userId, { categoryId: input.categoryId });
    const h = await this.prisma.habit.create({
      data: {
        userId,
        name: input.name,
        description: input.description ?? null,
        frequency: input.frequency,
        daysOfWeek: input.frequency === 'DAILY' ? undefined : (input.daysOfWeek ?? undefined),
        timesPerWeek: input.frequency === 'DAILY' ? null : (input.timesPerWeek ?? null),
        targetPerDay: input.targetPerDay,
        reminderTime: input.reminderTime ?? null,
        color: input.color ?? null,
        icon: input.icon ?? null,
        categoryId: input.categoryId ?? null,
      },
    });
    return this.get(userId, h.id);
  }

  async update(userId: string, id: string, input: UpdateHabit) {
    const current = await this.prisma.habit.findFirst({ where: { id, userId } });
    if (!current) throw new NotFoundException('Habit not found');
    await assertOwnedRefs(this.prisma, userId, { categoryId: input.categoryId });
    const { archived, daysOfWeek, ...rest } = input;
    await this.prisma.habit.update({
      where: { id },
      data: {
        ...rest,
        ...(daysOfWeek !== undefined ? { daysOfWeek: daysOfWeek ?? undefined } : {}),
        ...(archived !== undefined ? { archivedAt: archived ? new Date() : null } : {}),
      },
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.habit.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Habit not found');
    await this.audit.record({ userId, action: 'habit.deleted', entityType: 'Habit', entityId: id });
  }

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

  @Get()
  @ApiOperation({ summary: 'Habits with stats and recent completions' })
  @ApiZodQuery(listHabitsQuerySchema)
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listHabitsQuerySchema)) q: ListHabitsQuery) {
    return this.habits.list(user.userId, q);
  }

  @Post()
  @ApiZodBody(createHabitSchema)
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createHabitSchema)) body: CreateHabit) {
    return this.habits.create(user.userId, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.habits.get(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update or archive a habit' })
  @ApiZodBody(updateHabitSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateHabitSchema)) body: UpdateHabit,
  ) {
    return this.habits.update(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a habit and its history (archive keeps it)' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.habits.remove(user.userId, id);
  }

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
