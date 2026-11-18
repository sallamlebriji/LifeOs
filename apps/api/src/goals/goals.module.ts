/** Goals (annual → daily hierarchy), milestones and progress history. */
import {
  BadRequestException,
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
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { type Prisma } from '@lifeos/database';
import { type GoalDto, type Page, type ProgressEntry } from '@lifeos/shared';
import {
  createGoalSchema,
  createMilestoneSchema,
  listGoalsQuerySchema,
  type ListGoalsQuery,
  recordProgressSchema,
  type RecordProgressInput,
  updateGoalSchema,
  updateMilestoneSchema,
  type z,
} from '@lifeos/validation';
import { AuditService } from '../audit/audit.service';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators';
import {
  assertOwnedRefs,
  categorySelect,
  cursorArgs,
  fromDateOnly,
  iso,
  toDateOnly,
  toPage,
} from '../common/module-helpers';
import { ApiZodBody, ApiZodQuery } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

type CreateGoal = z.output<typeof createGoalSchema>;
type UpdateGoal = z.output<typeof updateGoalSchema>;
type CreateMilestone = z.output<typeof createMilestoneSchema>;
type UpdateMilestone = z.output<typeof updateMilestoneSchema>;

const goalInclude = {
  category: categorySelect,
  milestones: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  _count: { select: { tasks: true } },
} satisfies Prisma.GoalInclude;
type GoalRow = Prisma.GoalGetPayload<{ include: typeof goalInclude }>;

const LEVEL_RANK = { ANNUAL: 0, MONTHLY: 1, WEEKLY: 2, DAILY: 3 } as const;
const MAX_PROGRESS_LOG = 200;

export function milestoneDto(m: { id: string; title: string; dueDate: Date | null; completedAt: Date | null; sortOrder: number }) {
  return { id: m.id, title: m.title, dueDate: fromDateOnly(m.dueDate), completedAt: iso(m.completedAt), sortOrder: m.sortOrder };
}

function parseLog(value: Prisma.JsonValue | null): ProgressEntry[] {
  return Array.isArray(value) ? (value as unknown as ProgressEntry[]) : [];
}

/** Target-based progress when there's a target, otherwise milestone completion. */
export function goalProgress(g: { status: string; targetValue: number | null; currentValue: number; milestones: Array<{ completedAt: unknown }> }): number {
  if (g.status === 'COMPLETED') return 1;
  if (g.targetValue && g.targetValue > 0) return Math.min(1, Math.max(0, g.currentValue / g.targetValue));
  if (g.milestones.length) return g.milestones.filter((m) => m.completedAt).length / g.milestones.length;
  return 0;
}

function toGoalDto(g: GoalRow): GoalDto {
  const targetValue = g.targetValue === null ? null : Number(g.targetValue);
  const currentValue = Number(g.currentValue);
  return {
    id: g.id,
    title: g.title,
    description: g.description,
    level: g.level,
    priority: g.priority,
    status: g.status,
    startDate: fromDateOnly(g.startDate),
    deadline: fromDateOnly(g.deadline),
    targetValue,
    currentValue,
    unit: g.unit,
    progress: goalProgress({ status: g.status, targetValue, currentValue, milestones: g.milestones }),
    parentId: g.parentId,
    category: g.category,
    milestones: g.milestones.map(milestoneDto),
    progressLog: parseLog(g.progressLog),
    taskCount: g._count.tasks,
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private invalid(field: string, message: string) {
    return new BadRequestException({ statusCode: 400, error: 'Bad Request', message, issues: { [field]: [message] } });
  }

  /** A parent must be the caller's, at a broader level, and not create a loop. */
  private async assertParent(userId: string, parentId: string | null | undefined, level: keyof typeof LEVEL_RANK, selfId?: string) {
    if (!parentId) return;
    let cursor: string | null = parentId;
    let first = true;
    while (cursor) {
      if (cursor === selfId) throw this.invalid('parentId', 'That would make the goal its own ancestor');
      const row: { level: keyof typeof LEVEL_RANK; parentId: string | null } | null = await this.prisma.goal.findFirst({
        where: { id: cursor, userId },
        select: { level: true, parentId: true },
      });
      if (!row) throw this.invalid('parentId', 'Parent goal not found');
      if (first && LEVEL_RANK[row.level] >= LEVEL_RANK[level]) {
        throw this.invalid('parentId', 'A parent goal must cover a longer period (e.g. a monthly goal under an annual one)');
      }
      first = false;
      cursor = row.parentId;
    }
  }

  private async load(userId: string, id: string): Promise<GoalRow> {
    const goal = await this.prisma.goal.findFirst({ where: { id, userId }, include: goalInclude });
    if (!goal) throw new NotFoundException('Goal not found');
    return goal;
  }

  async list(userId: string, q: ListGoalsQuery): Promise<Page<GoalDto>> {
    const rows = await this.prisma.goal.findMany({
      where: { userId, ...(q.level ? { level: q.level } : {}), ...(q.status ? { status: q.status } : {}) },
      include: goalInclude,
      orderBy: [{ level: 'asc' }, { status: 'asc' }, { deadline: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      ...cursorArgs(q.cursor, q.limit),
    });
    return toPage(rows, q.limit, toGoalDto);
  }

  async get(userId: string, id: string) {
    return toGoalDto(await this.load(userId, id));
  }

  async create(userId: string, input: CreateGoal) {
    await Promise.all([
      assertOwnedRefs(this.prisma, userId, { categoryId: input.categoryId }),
      this.assertParent(userId, input.parentId, input.level),
    ]);
    const goal = await this.prisma.goal.create({
      data: {
        userId,
        title: input.title,
        description: input.description ?? null,
        level: input.level,
        priority: input.priority,
        status: input.status,
        startDate: toDateOnly(input.startDate) ?? null,
        deadline: toDateOnly(input.deadline) ?? null,
        targetValue: input.targetValue ?? null,
        unit: input.unit ?? null,
        parentId: input.parentId ?? null,
        categoryId: input.categoryId ?? null,
      },
      include: goalInclude,
    });
    return toGoalDto(goal);
  }

  async update(userId: string, id: string, input: UpdateGoal) {
    const current = await this.load(userId, id);
    const level = input.level ?? current.level;
    await Promise.all([
      assertOwnedRefs(this.prisma, userId, { categoryId: input.categoryId }),
      input.parentId !== undefined || input.level
        ? this.assertParent(userId, input.parentId !== undefined ? input.parentId : current.parentId, level, id)
        : Promise.resolve(),
    ]);
    const startDate = input.startDate !== undefined ? input.startDate : fromDateOnly(current.startDate);
    const deadline = input.deadline !== undefined ? input.deadline : fromDateOnly(current.deadline);
    if (startDate && deadline && deadline < startDate) throw this.invalid('deadline', 'Deadline is before the start date');
    const { startDate: s, deadline: d, ...rest } = input;
    const goal = await this.prisma.goal.update({
      where: { id },
      data: {
        ...rest,
        ...(s !== undefined ? { startDate: toDateOnly(s) } : {}),
        ...(d !== undefined ? { deadline: toDateOnly(d) } : {}),
      },
      include: goalInclude,
    });
    return toGoalDto(goal);
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.goal.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Goal not found');
    await this.audit.record({ userId, action: 'goal.deleted', entityType: 'Goal', entityId: id });
  }

  /** Sets the current value and appends to the progress history (capped). */
  async recordProgress(userId: string, id: string, input: RecordProgressInput) {
    const goal = await this.load(userId, id);
    const entry: ProgressEntry = { at: new Date().toISOString(), value: input.value, ...(input.note ? { note: input.note } : {}) };
    const log = [...parseLog(goal.progressLog), entry].slice(-MAX_PROGRESS_LOG);
    const reached = goal.targetValue !== null && input.value >= Number(goal.targetValue);
    const updated = await this.prisma.goal.update({
      where: { id },
      data: {
        currentValue: input.value,
        progressLog: log as unknown as Prisma.InputJsonValue,
        ...(reached && goal.status !== 'COMPLETED' ? { status: 'COMPLETED' } : {}),
        ...(goal.status === 'NOT_STARTED' && !reached ? { status: 'ACTIVE' } : {}),
      },
      include: goalInclude,
    });
    return toGoalDto(updated);
  }

  async addMilestone(userId: string, goalId: string, input: CreateMilestone) {
    await this.load(userId, goalId);
    const last = await this.prisma.goalMilestone.aggregate({ where: { goalId }, _max: { sortOrder: true } });
    await this.prisma.goalMilestone.create({
      data: { goalId, title: input.title, dueDate: toDateOnly(input.dueDate) ?? null, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    return this.get(userId, goalId);
  }

  async updateMilestone(userId: string, goalId: string, milestoneId: string, input: UpdateMilestone) {
    const { completed, dueDate, ...rest } = input;
    const { count } = await this.prisma.goalMilestone.updateMany({
      where: { id: milestoneId, goalId, goal: { userId } },
      data: {
        ...rest,
        ...(dueDate !== undefined ? { dueDate: toDateOnly(dueDate) } : {}),
        ...(completed !== undefined ? { completedAt: completed ? new Date() : null } : {}),
      },
    });
    if (count === 0) throw new NotFoundException('Milestone not found');
    return this.get(userId, goalId);
  }

  async removeMilestone(userId: string, goalId: string, milestoneId: string) {
    const { count } = await this.prisma.goalMilestone.deleteMany({ where: { id: milestoneId, goalId, goal: { userId } } });
    if (count === 0) throw new NotFoundException('Milestone not found');
    return this.get(userId, goalId);
  }
}

@ApiTags('goals')
@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Get()
  @ApiOperation({ summary: 'List goals (cursor-paginated)' })
  @ApiZodQuery(listGoalsQuerySchema)
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listGoalsQuerySchema)) q: ListGoalsQuery) {
    return this.goals.list(user.userId, q);
  }

  @Post()
  @ApiOperation({ summary: 'Create a goal' })
  @ApiZodBody(createGoalSchema)
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createGoalSchema)) body: CreateGoal) {
    return this.goals.create(user.userId, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.goals.get(user.userId, id);
  }

  @Patch(':id')
  @ApiZodBody(updateGoalSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateGoalSchema)) body: UpdateGoal,
  ) {
    return this.goals.update(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.goals.remove(user.userId, id);
  }

  @Post(':id/progress')
  @ApiOperation({ summary: 'Record progress (appends to history; completes the goal at target)' })
  @ApiZodBody(recordProgressSchema)
  progress(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(recordProgressSchema)) body: RecordProgressInput,
  ) {
    return this.goals.recordProgress(user.userId, id, body);
  }

  @Post(':id/milestones')
  @ApiZodBody(createMilestoneSchema)
  addMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(createMilestoneSchema)) body: CreateMilestone,
  ) {
    return this.goals.addMilestone(user.userId, id, body);
  }

  @Patch(':id/milestones/:milestoneId')
  @ApiZodBody(updateMilestoneSchema)
  updateMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
    @Body(new ZodValidationPipe(updateMilestoneSchema)) body: UpdateMilestone,
  ) {
    return this.goals.updateMilestone(user.userId, id, milestoneId, body);
  }

  @Delete(':id/milestones/:milestoneId')
  removeMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
  ) {
    return this.goals.removeMilestone(user.userId, id, milestoneId);
  }
}

@Module({ controllers: [GoalsController], providers: [GoalsService] })
export class GoalsModule {}
