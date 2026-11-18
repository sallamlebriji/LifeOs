/** Sports & fitness: workouts with exercise logs, weekly target, statistics and recovery hints. */
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
import { addDaysKey, localDateKey, localTimeOnDay, type SportsStatsDto, startOfWeekKey, type WorkoutDto, type WorkoutTypeValue } from '@lifeos/shared';
import {
  createWorkoutSchema,
  listWorkoutsQuerySchema,
  type ListWorkoutsQuery,
  sportsSettingsSchema,
  updateWorkoutSchema,
  type z,
} from '@lifeos/validation';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators';
import { userTimezone } from '../common/module-helpers';
import { ApiZodBody, ApiZodQuery } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

type CreateWorkout = z.output<typeof createWorkoutSchema>;
type UpdateWorkout = z.output<typeof updateWorkoutSchema>;

const include = { exercises: { orderBy: { sortOrder: 'asc' } } } satisfies Prisma.WorkoutInclude;
type Row = Prisma.WorkoutGetPayload<{ include: typeof include }>;

const num = (d: Prisma.Decimal | null) => (d === null ? null : Number(d));

function toDto(w: Row): WorkoutDto {
  return {
    id: w.id,
    title: w.title,
    type: w.type,
    startAt: w.startAt.toISOString(),
    durationMinutes: w.durationMinutes,
    intensity: w.intensity,
    notes: w.notes,
    exercises: w.exercises.map((e) => ({
      id: e.id,
      name: e.name,
      sets: e.sets,
      reps: e.reps,
      weightKg: num(e.weightKg),
      distanceKm: num(e.distanceKm),
      durationMinutes: e.durationMinutes,
    })),
  };
}

const exerciseRows = (exercises: CreateWorkout['exercises']) =>
  exercises.map((e, i) => ({
    name: e.name,
    sets: e.sets ?? null,
    reps: e.reps ?? null,
    weightKg: e.weightKg ?? null,
    distanceKm: e.distanceKm ?? null,
    durationMinutes: e.durationMinutes ?? null,
    sortOrder: i,
  }));

/** Pure stats from workouts — unit-tested. */
export function sportsStats(
  workouts: Array<{ startAt: Date; durationMinutes: number; type: WorkoutTypeValue; intensity: number | null }>,
  opts: { today: string; timezone: string; weekStartsOn: number; target: number; now: Date },
): SportsStatsDto {
  const weekStart = startOfWeekKey(opts.today, opts.weekStartsOn);
  const weeks = Array.from({ length: 8 }, (_, i) => addDaysKey(weekStart, -7 * (7 - i)));
  const byWeek = new Map(weeks.map((w) => [w, { weekStart: w, sessions: 0, minutes: 0 }]));
  const minutesByType: Record<WorkoutTypeValue, number> = { STRENGTH: 0, CARDIO: 0, MOBILITY: 0, SPORT: 0, OTHER: 0 };
  const fourWeeksAgo = addDaysKey(weekStart, -21);
  let lastHard: Date | null = null;
  let last: Date | null = null;
  for (const w of workouts) {
    const key = startOfWeekKey(localDateKey(w.startAt, opts.timezone), opts.weekStartsOn);
    const bucket = byWeek.get(key);
    if (bucket) {
      bucket.sessions++;
      bucket.minutes += w.durationMinutes;
    }
    if (key >= fourWeeksAgo) minutesByType[w.type] += w.durationMinutes;
    if (w.startAt <= opts.now && (!last || w.startAt > last)) last = w.startAt;
    if ((w.intensity ?? 0) >= 8 && w.startAt <= opts.now && (!lastHard || w.startAt > lastHard)) lastHard = w.startAt;
  }
  const list = weeks.map((w) => byWeek.get(w)!);
  const thisWeek = list[list.length - 1]!;
  let streak = opts.target > 0 && thisWeek.sessions >= opts.target ? 1 : 0;
  for (let i = list.length - 2; i >= 0 && opts.target > 0 && list[i]!.sessions >= opts.target; i--) streak++;
  return {
    weekStart,
    weeklyTarget: opts.target,
    thisWeek: { sessions: thisWeek.sessions, minutes: thisWeek.minutes },
    weekStreak: streak,
    weeks: list,
    minutesByType,
    lastWorkoutAt: last?.toISOString() ?? null,
    daysSinceHardSession: lastHard ? Math.floor((opts.now.getTime() - lastHard.getTime()) / 86_400_000) : null,
  };
}

@Injectable()
export class SportsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, q: ListWorkoutsQuery) {
    const rows = await this.prisma.workout.findMany({
      where: { userId, ...(q.from || q.to ? { startAt: { ...(q.from ? { gte: q.from } : {}), ...(q.to ? { lt: q.to } : {}) } } : {}) },
      include,
      orderBy: [{ startAt: 'desc' }, { id: 'asc' }],
      take: q.limit,
    });
    return rows.map(toDto);
  }

  async get(userId: string, id: string) {
    const w = await this.prisma.workout.findFirst({ where: { id, userId }, include });
    if (!w) throw new NotFoundException('Workout not found');
    return toDto(w);
  }

  async create(userId: string, input: CreateWorkout) {
    const w = await this.prisma.workout.create({
      data: {
        userId,
        title: input.title,
        type: input.type,
        startAt: input.startAt,
        durationMinutes: input.durationMinutes,
        intensity: input.intensity ?? null,
        notes: input.notes ?? null,
        exercises: { create: exerciseRows(input.exercises) },
      },
      include,
    });
    return toDto(w);
  }

  async update(userId: string, id: string, input: UpdateWorkout) {
    const { exercises, ...rest } = input;
    await this.prisma.$transaction(async (tx) => {
      const owned = await tx.workout.findFirst({ where: { id, userId }, select: { id: true } });
      if (!owned) throw new NotFoundException('Workout not found');
      if (Object.keys(rest).length) await tx.workout.update({ where: { id }, data: rest });
      if (exercises) {
        await tx.exerciseLog.deleteMany({ where: { workoutId: id } });
        await tx.exerciseLog.createMany({ data: exerciseRows(exercises).map((e) => ({ ...e, workoutId: id })) });
      }
    });
    return this.get(userId, id);
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.workout.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Workout not found');
  }

  async stats(userId: string, now = new Date()): Promise<SportsStatsDto> {
    const { timezone, weekStartsOn } = await userTimezone(this.prisma, userId);
    const prefs = await this.prisma.userPreferences.findUnique({ where: { userId }, select: { weeklyWorkoutTarget: true } });
    const today = localDateKey(now, timezone);
    const from = localTimeOnDay(new Date(`${addDaysKey(startOfWeekKey(today, weekStartsOn), -49)}T12:00:00Z`), '00:00', timezone);
    const workouts = await this.prisma.workout.findMany({
      where: { userId, startAt: { gte: from } },
      select: { startAt: true, durationMinutes: true, type: true, intensity: true },
    });
    return sportsStats(workouts, { today, timezone, weekStartsOn, target: prefs?.weeklyWorkoutTarget ?? 3, now });
  }

  async setTarget(userId: string, weeklyWorkoutTarget: number) {
    await this.prisma.userPreferences.update({ where: { userId }, data: { weeklyWorkoutTarget } });
    return this.stats(userId);
  }
}

@ApiTags('sports')
@Controller('sports')
export class SportsController {
  constructor(private readonly sports: SportsService) {}

  @Get('workouts')
  @ApiZodQuery(listWorkoutsQuerySchema)
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listWorkoutsQuerySchema)) q: ListWorkoutsQuery) {
    return this.sports.list(user.userId, q);
  }

  @Post('workouts')
  @ApiOperation({ summary: 'Log a workout with its exercises' })
  @ApiZodBody(createWorkoutSchema)
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createWorkoutSchema)) body: CreateWorkout) {
    return this.sports.create(user.userId, body);
  }

  @Get('workouts/:id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.sports.get(user.userId, id);
  }

  @Patch('workouts/:id')
  @ApiOperation({ summary: 'Update a workout (an `exercises` array replaces the list)' })
  @ApiZodBody(updateWorkoutSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateWorkoutSchema)) body: UpdateWorkout,
  ) {
    return this.sports.update(user.userId, id, body);
  }

  @Delete('workouts/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.sports.remove(user.userId, id);
  }

  @Get('stats')
  @ApiOperation({ summary: 'This week vs target, 8-week history, minutes by type, recovery hint' })
  stats(@CurrentUser() user: AuthenticatedUser) {
    return this.sports.stats(user.userId);
  }

  @Put('target')
  @ApiZodBody(sportsSettingsSchema)
  setTarget(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(sportsSettingsSchema)) body: { weeklyWorkoutTarget: number }) {
    return this.sports.setTarget(user.userId, body.weeklyWorkoutTarget);
  }
}

@Module({ controllers: [SportsController], providers: [SportsService] })
export class SportsModule {}
