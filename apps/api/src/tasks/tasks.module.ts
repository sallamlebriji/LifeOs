/**
 * Tasks: CRUD, subtasks (one level), dependencies (cycle-checked), recurrence
 * (completing a recurring task creates the next occurrence), fixed vs flexible
 * scheduling, time tracking and manual ordering.
 */
import {
  BadRequestException,
  Body,
  ConflictException,
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
import {
  localDateKey,
  nextRecurrenceDate,
  type Page,
  type TaskDetailDto,
  type TaskDto,
  type TaskStatusValue,
} from '@lifeos/shared';
import {
  addDependencySchema,
  type AddDependencyInput,
  createTaskSchema,
  listTasksQuerySchema,
  type ListTasksQuery,
  logTimeSchema,
  type LogTimeInput,
  reorderSchema,
  type ReorderInput,
  setTaskStatusSchema,
  type SetTaskStatusInput,
  updateTaskSchema,
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
  userTimezone,
  versionedMiss,
} from '../common/module-helpers';
import { ApiZodBody, ApiZodQuery } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { shiftByDays, wouldCreateCycle } from './task-rules';

type CreateTask = z.output<typeof createTaskSchema>;
type UpdateTask = z.output<typeof updateTaskSchema>;

const taskInclude = {
  category: categorySelect,
  project: { select: { id: true, name: true } },
  subtasks: { select: { status: true } },
} satisfies Prisma.TaskInclude;

type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

export function toTaskDto(t: TaskRow): TaskDto {
  return {
    id: t.id,
    title: t.title,
    notes: t.notes,
    status: t.status,
    priority: t.priority,
    estimatedMinutes: t.estimatedMinutes,
    actualMinutes: t.actualMinutes,
    dueAt: iso(t.dueAt),
    plannedDate: fromDateOnly(t.plannedDate),
    schedulingMode: t.schedulingMode,
    fixedStartAt: iso(t.fixedStartAt),
    splittable: t.splittable,
    minSessionMinutes: t.minSessionMinutes,
    preferredTimeOfDay: t.preferredTimeOfDay,
    recurrenceRule: t.recurrenceRule,
    completedAt: iso(t.completedAt),
    sortOrder: t.sortOrder,
    version: t.version,
    parentId: t.parentId,
    projectId: t.projectId,
    goalId: t.goalId,
    category: t.category,
    project: t.project,
    subtaskCount: t.subtasks.length,
    subtasksDone: t.subtasks.filter((s) => s.status === 'COMPLETED').length,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
  };
}

function orderFor(sort: ListTasksQuery['sort']): Prisma.TaskOrderByWithRelationInput[] {
  switch (sort) {
    case 'due':
      return [{ dueAt: { sort: 'asc', nulls: 'last' } }, { plannedDate: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }];
    case 'created':
      return [{ createdAt: 'desc' }, { id: 'asc' }];
    case 'manual':
      return [{ sortOrder: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }];
    default:
      // Open work first, most important first, soonest first.
      return [
        { status: 'asc' },
        { priority: 'desc' },
        { dueAt: { sort: 'asc', nulls: 'last' } },
        { plannedDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
        { id: 'asc' },
      ];
  }
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(userId: string, q: ListTasksQuery): Promise<Page<TaskDto>> {
    const where: Prisma.TaskWhereInput = {
      userId,
      ...(q.includeSubtasks ? {} : { parentId: null }),
      ...(q.status === 'OPEN'
        ? { status: { in: ['TODO', 'IN_PROGRESS'] } }
        : q.status
          ? { status: q.status }
          : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.projectId ? { projectId: q.projectId } : {}),
      ...(q.goalId ? { goalId: q.goalId } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.q ? { title: { contains: q.q } } : {}),
    };
    const rows = await this.prisma.task.findMany({
      where,
      include: taskInclude,
      orderBy: orderFor(q.sort),
      ...cursorArgs(q.cursor, q.limit),
    });
    return toPage(rows, q.limit, toTaskDto);
  }

  async get(userId: string, id: string): Promise<TaskDetailDto> {
    const task = await this.prisma.task.findFirst({
      where: { id, userId },
      include: {
        ...taskInclude,
        dependsOn: { include: { dependsOn: { select: { id: true, title: true, status: true } } } },
        blocks: { include: { task: { select: { id: true, title: true, status: true } } } },
      },
    });
    if (!task) throw new NotFoundException('Task not found');
    const subtasks = await this.prisma.task.findMany({
      where: { parentId: id, userId },
      include: taskInclude,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return {
      ...toTaskDto(task),
      subtasks: subtasks.map(toTaskDto),
      dependsOn: task.dependsOn.map((d) => d.dependsOn),
      blocks: task.blocks.map((b) => b.task),
    };
  }

  private async assertParent(userId: string, parentId: string | null | undefined, selfId?: string) {
    if (!parentId) return;
    if (parentId === selfId) throw this.invalid('parentId', 'A task can’t be its own parent');
    const parent = await this.prisma.task.findFirst({ where: { id: parentId, userId }, select: { parentId: true } });
    if (!parent) throw this.invalid('parentId', 'Parent task not found');
    if (parent.parentId) throw this.invalid('parentId', 'Subtasks can’t have subtasks of their own');
    if (selfId && (await this.prisma.task.count({ where: { parentId: selfId } })) > 0) {
      throw this.invalid('parentId', 'A task with subtasks can’t become a subtask');
    }
  }

  private invalid(field: string, message: string) {
    return new BadRequestException({ statusCode: 400, error: 'Bad Request', message, issues: { [field]: [message] } });
  }

  async create(userId: string, input: CreateTask): Promise<TaskDto> {
    await Promise.all([
      assertOwnedRefs(this.prisma, userId, input),
      this.assertParent(userId, input.parentId),
    ]);
    let plannedDate = input.plannedDate;
    if (input.recurrenceRule && !plannedDate) {
      // A recurring task needs an anchor day; default to today in the user's timezone.
      plannedDate = localDateKey(new Date(), (await userTimezone(this.prisma, userId)).timezone);
    }
    const created = await this.prisma.task.create({
      data: {
        userId,
        title: input.title,
        notes: input.notes ?? null,
        priority: input.priority,
        estimatedMinutes: input.estimatedMinutes ?? null,
        dueAt: input.dueAt ?? null,
        plannedDate: toDateOnly(plannedDate) ?? null,
        schedulingMode: input.schedulingMode,
        fixedStartAt: input.schedulingMode === 'FIXED' ? (input.fixedStartAt ?? null) : null,
        splittable: input.splittable,
        minSessionMinutes: input.minSessionMinutes ?? null,
        preferredTimeOfDay: input.preferredTimeOfDay,
        recurrenceRule: input.recurrenceRule ?? null,
        parentId: input.parentId ?? null,
        projectId: input.projectId ?? null,
        goalId: input.goalId ?? null,
        categoryId: input.categoryId ?? null,
      },
      include: taskInclude,
    });
    return toTaskDto(created);
  }

  async update(userId: string, id: string, input: UpdateTask): Promise<TaskDto> {
    const current = await this.prisma.task.findFirst({ where: { id, userId } });
    if (!current) throw new NotFoundException('Task not found');
    await Promise.all([
      assertOwnedRefs(this.prisma, userId, input),
      input.parentId !== undefined ? this.assertParent(userId, input.parentId, id) : Promise.resolve(),
    ]);
    const mode = input.schedulingMode ?? current.schedulingMode;
    const fixedStart = input.fixedStartAt !== undefined ? input.fixedStartAt : current.fixedStartAt;
    if (mode === 'FIXED' && !fixedStart) throw this.invalid('fixedStartAt', 'A fixed task needs a start time');
    if (mode === 'FIXED' && (input.splittable ?? current.splittable)) {
      throw this.invalid('splittable', 'A fixed-time task can’t be split');
    }

    const { version, plannedDate, status, ...rest } = input;
    const data: Prisma.TaskUncheckedUpdateManyInput = {
      ...rest,
      ...(plannedDate !== undefined ? { plannedDate: toDateOnly(plannedDate) } : {}),
      ...(mode === 'FLEXIBLE' && input.schedulingMode === 'FLEXIBLE' ? { fixedStartAt: null } : {}),
      version: { increment: 1 },
    };
    if (status && status !== current.status) {
      Object.assign(data, await this.statusChange(userId, current.id, status));
    }

    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.task.updateMany({ where: { id, userId, version }, data });
      if (count === 0) return versionedMiss(tx.task.findFirst({ where: { id, userId } }), 'Task');
      if (status === 'COMPLETED' && current.status !== 'COMPLETED') await this.rollRecurrence(tx, id);
      return toTaskDto(await tx.task.findUniqueOrThrow({ where: { id }, include: taskInclude }));
    });
  }

  /** Quick status change used by My Day and the Kanban board (no version needed). */
  async setStatus(userId: string, taskId: string, input: SetTaskStatusInput) {
    const current = await this.prisma.task.findFirst({ where: { id: taskId, userId }, select: { status: true } });
    if (!current) throw new NotFoundException('Task not found');
    const extra = current.status === input.status ? {} : await this.statusChange(userId, taskId, input.status);
    return this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id: taskId }, data: { status: input.status, ...extra, version: { increment: 1 } } });
      if (input.status === 'COMPLETED' && current.status !== 'COMPLETED') await this.rollRecurrence(tx, taskId);
      return tx.task.findUniqueOrThrow({
        where: { id: taskId },
        select: { id: true, status: true, completedAt: true, version: true },
      });
    });
  }

  private async statusChange(userId: string, taskId: string, status: TaskStatusValue) {
    if (status === 'COMPLETED') {
      const blockers = await this.prisma.taskDependency.findMany({
        where: { taskId, dependsOn: { userId, status: { notIn: ['COMPLETED', 'CANCELLED'] } } },
        include: { dependsOn: { select: { title: true } } },
      });
      if (blockers.length) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          message: `Finish “${blockers[0]!.dependsOn.title}” first — this task depends on it.`,
        });
      }
    }
    return { status, completedAt: status === 'COMPLETED' ? new Date() : null };
  }

  /** Completing a recurring task spawns its next occurrence (the series lives on the new row). */
  private async rollRecurrence(tx: Prisma.TransactionClient, taskId: string) {
    const t = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
    if (!t.recurrenceRule || !t.plannedDate) return;
    const anchor = fromDateOnly(t.plannedDate)!;
    const next = nextRecurrenceDate(t.recurrenceRule, anchor, anchor);
    if (!next) return;
    await tx.task.update({ where: { id: taskId }, data: { recurrenceRule: null } });
    const subtasks = await tx.task.findMany({ where: { parentId: taskId } });
    const created = await tx.task.create({
      data: {
        userId: t.userId,
        title: t.title,
        notes: t.notes,
        priority: t.priority,
        estimatedMinutes: t.estimatedMinutes,
        dueAt: shiftByDays(t.dueAt, anchor, next),
        plannedDate: toDateOnly(next),
        schedulingMode: t.schedulingMode,
        fixedStartAt: shiftByDays(t.fixedStartAt, anchor, next),
        splittable: t.splittable,
        minSessionMinutes: t.minSessionMinutes,
        preferredTimeOfDay: t.preferredTimeOfDay,
        recurrenceRule: t.recurrenceRule,
        projectId: t.projectId,
        goalId: t.goalId,
        categoryId: t.categoryId,
      },
    });
    if (subtasks.length) {
      await tx.task.createMany({
        data: subtasks.map((s) => ({
          userId: s.userId,
          parentId: created.id,
          title: s.title,
          priority: s.priority,
          estimatedMinutes: s.estimatedMinutes,
          sortOrder: s.sortOrder,
          plannedDate: toDateOnly(next),
        })),
      });
    }
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.task.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Task not found');
    await this.audit.record({ userId, action: 'task.deleted', entityType: 'Task', entityId: id });
  }

  async addDependency(userId: string, taskId: string, input: AddDependencyInput) {
    const tasks = await this.prisma.task.findMany({
      where: { userId, id: { in: [taskId, input.dependsOnId] } },
      select: { id: true },
    });
    if (!tasks.some((t) => t.id === taskId)) throw new NotFoundException('Task not found');
    if (!tasks.some((t) => t.id === input.dependsOnId)) throw this.invalid('dependsOnId', 'Task not found');
    const edges = await this.prisma.taskDependency.findMany({
      where: { task: { userId } },
      select: { taskId: true, dependsOnId: true },
    });
    if (wouldCreateCycle(edges.map((e) => [e.taskId, e.dependsOnId] as const), taskId, input.dependsOnId)) {
      throw this.invalid('dependsOnId', 'That would create a circular dependency');
    }
    await this.prisma.taskDependency.upsert({
      where: { taskId_dependsOnId: { taskId, dependsOnId: input.dependsOnId } },
      update: {},
      create: { taskId, dependsOnId: input.dependsOnId },
    });
    return this.get(userId, taskId);
  }

  async removeDependency(userId: string, taskId: string, dependsOnId: string) {
    const { count } = await this.prisma.taskDependency.deleteMany({
      where: { taskId, dependsOnId, task: { userId } },
    });
    if (count === 0) throw new NotFoundException('Dependency not found');
  }

  async logTime(userId: string, id: string, input: LogTimeInput): Promise<TaskDto> {
    const { count } = await this.prisma.task.updateMany({
      where: { id, userId },
      data: { actualMinutes: { increment: input.minutes } },
    });
    if (count === 0) throw new NotFoundException('Task not found');
    // MySQL's NULL + n is NULL: initialise on first log.
    await this.prisma.task.updateMany({ where: { id, userId, actualMinutes: null }, data: { actualMinutes: input.minutes } });
    return toTaskDto(await this.prisma.task.findUniqueOrThrow({ where: { id }, include: taskInclude }));
  }

  async reorder(userId: string, input: ReorderInput) {
    const owned = await this.prisma.task.count({ where: { userId, id: { in: input.ids } } });
    if (owned !== new Set(input.ids).size) throw new NotFoundException('Task not found');
    await this.prisma.$transaction(
      input.ids.map((id, index) => this.prisma.task.update({ where: { id }, data: { sortOrder: index } })),
    );
  }
}

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'List tasks (cursor-paginated, filterable)' })
  @ApiZodQuery(listTasksQuerySchema)
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listTasksQuerySchema)) q: ListTasksQuery) {
    return this.tasks.list(user.userId, q);
  }

  @Post()
  @ApiOperation({ summary: 'Create a task or subtask' })
  @ApiZodBody(createTaskSchema)
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createTaskSchema)) body: CreateTask) {
    return this.tasks.create(user.userId, body);
  }

  @Put('order')
  @HttpCode(204)
  @ApiOperation({ summary: 'Set manual order (positions become sortOrder)' })
  @ApiZodBody(reorderSchema)
  async reorder(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(reorderSchema)) body: ReorderInput) {
    await this.tasks.reorder(user.userId, body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Task with subtasks and dependencies' })
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.tasks.get(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a task (send the `version` you last read; 409 if it changed)' })
  @ApiZodBody(updateTaskSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) body: UpdateTask,
  ) {
    return this.tasks.update(user.userId, id, body);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change task status (complete, reopen, cancel)' })
  @ApiZodBody(setTaskStatusSchema)
  setStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(setTaskStatusSchema)) body: SetTaskStatusInput,
  ) {
    return this.tasks.setStatus(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a task (and its subtasks)' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.tasks.remove(user.userId, id);
  }

  @Post(':id/dependencies')
  @ApiOperation({ summary: 'Make this task depend on another (cycles are rejected)' })
  @ApiZodBody(addDependencySchema)
  addDependency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(addDependencySchema)) body: AddDependencyInput,
  ) {
    return this.tasks.addDependency(user.userId, id, body);
  }

  @Delete(':id/dependencies/:dependsOnId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Remove a dependency' })
  async removeDependency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('dependsOnId', new ParseUUIDPipe()) dependsOnId: string,
  ) {
    await this.tasks.removeDependency(user.userId, id, dependsOnId);
  }

  @Post(':id/time')
  @ApiOperation({ summary: 'Log time spent on a task (minutes)' })
  @ApiZodBody(logTimeSchema)
  logTime(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(logTimeSchema)) body: LogTimeInput,
  ) {
    return this.tasks.logTime(user.userId, id, body);
  }
}

@Module({ controllers: [TasksController], providers: [TasksService], exports: [TasksService] })
export class TasksModule {}
