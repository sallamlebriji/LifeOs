/** Projects: CRUD, milestones, task counts per Kanban column and time tracking. */
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
import { type Page, type ProjectDto, type TaskStatusValue } from '@lifeos/shared';
import {
  createMilestoneSchema,
  createProjectSchema,
  listProjectsQuerySchema,
  type ListProjectsQuery,
  updateMilestoneSchema,
  updateProjectSchema,
  type z,
} from '@lifeos/validation';
import { AuditService } from '../audit/audit.service';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators';
import {
  assertOwnedRefs,
  categorySelect,
  cursorArgs,
  fromDateOnly,
  toDateOnly,
  toPage,
} from '../common/module-helpers';
import { ApiZodBody, ApiZodQuery } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { milestoneDto } from '../goals/goals.module';
import { PrismaService } from '../prisma/prisma.service';

type CreateProject = z.output<typeof createProjectSchema>;
type UpdateProject = z.output<typeof updateProjectSchema>;
type CreateMilestone = z.output<typeof createMilestoneSchema>;
type UpdateMilestone = z.output<typeof updateMilestoneSchema>;

const projectInclude = {
  category: categorySelect,
  milestones: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
  tasks: { where: { parentId: null }, select: { status: true, actualMinutes: true, estimatedMinutes: true } },
} satisfies Prisma.ProjectInclude;
type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

function toProjectDto(p: ProjectRow): ProjectDto {
  const taskCounts: Record<TaskStatusValue, number> = { TODO: 0, IN_PROGRESS: 0, COMPLETED: 0, CANCELLED: 0 };
  let trackedMinutes = 0;
  let estimatedMinutes = 0;
  for (const t of p.tasks) {
    taskCounts[t.status]++;
    trackedMinutes += t.actualMinutes ?? 0;
    if (t.status !== 'CANCELLED') estimatedMinutes += t.estimatedMinutes ?? 0;
  }
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    priority: p.priority,
    color: p.color,
    startDate: fromDateOnly(p.startDate),
    deadline: fromDateOnly(p.deadline),
    goalId: p.goalId,
    category: p.category,
    taskCounts,
    trackedMinutes,
    estimatedMinutes,
    milestones: p.milestones.map(milestoneDto),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async load(userId: string, id: string) {
    const p = await this.prisma.project.findFirst({ where: { id, userId }, include: projectInclude });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }

  async list(userId: string, q: ListProjectsQuery): Promise<Page<ProjectDto>> {
    const rows = await this.prisma.project.findMany({
      where: { userId, ...(q.status ? { status: q.status } : { status: { not: 'ARCHIVED' } }) },
      include: projectInclude,
      orderBy: [{ status: 'asc' }, { priority: 'desc' }, { deadline: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
      ...cursorArgs(q.cursor, q.limit),
    });
    return toPage(rows, q.limit, toProjectDto);
  }

  async get(userId: string, id: string) {
    return toProjectDto(await this.load(userId, id));
  }

  async create(userId: string, input: CreateProject) {
    await assertOwnedRefs(this.prisma, userId, { goalId: input.goalId, categoryId: input.categoryId });
    const p = await this.prisma.project.create({
      data: {
        userId,
        name: input.name,
        description: input.description ?? null,
        status: input.status,
        priority: input.priority,
        color: input.color ?? null,
        startDate: toDateOnly(input.startDate) ?? null,
        deadline: toDateOnly(input.deadline) ?? null,
        goalId: input.goalId ?? null,
        categoryId: input.categoryId ?? null,
      },
      include: projectInclude,
    });
    return toProjectDto(p);
  }

  async update(userId: string, id: string, input: UpdateProject) {
    const current = await this.load(userId, id);
    await assertOwnedRefs(this.prisma, userId, { goalId: input.goalId, categoryId: input.categoryId });
    const { startDate, deadline, ...rest } = input;
    const s = startDate !== undefined ? startDate : fromDateOnly(current.startDate);
    const d = deadline !== undefined ? deadline : fromDateOnly(current.deadline);
    if (s && d && d < s) {
      const message = 'Deadline is before the start date';
      throw new BadRequestException({ statusCode: 400, error: 'Bad Request', message, issues: { deadline: [message] } });
    }
    const p = await this.prisma.project.update({
      where: { id },
      data: {
        ...rest,
        ...(startDate !== undefined ? { startDate: toDateOnly(startDate) } : {}),
        ...(deadline !== undefined ? { deadline: toDateOnly(deadline) } : {}),
      },
      include: projectInclude,
    });
    return toProjectDto(p);
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.project.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Project not found');
    await this.audit.record({ userId, action: 'project.deleted', entityType: 'Project', entityId: id });
  }

  async addMilestone(userId: string, projectId: string, input: CreateMilestone) {
    await this.load(userId, projectId);
    const last = await this.prisma.projectMilestone.aggregate({ where: { projectId }, _max: { sortOrder: true } });
    await this.prisma.projectMilestone.create({
      data: { projectId, title: input.title, dueDate: toDateOnly(input.dueDate) ?? null, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    });
    return this.get(userId, projectId);
  }

  async updateMilestone(userId: string, projectId: string, milestoneId: string, input: UpdateMilestone) {
    const { completed, dueDate, ...rest } = input;
    const { count } = await this.prisma.projectMilestone.updateMany({
      where: { id: milestoneId, projectId, project: { userId } },
      data: {
        ...rest,
        ...(dueDate !== undefined ? { dueDate: toDateOnly(dueDate) } : {}),
        ...(completed !== undefined ? { completedAt: completed ? new Date() : null } : {}),
      },
    });
    if (count === 0) throw new NotFoundException('Milestone not found');
    return this.get(userId, projectId);
  }

  async removeMilestone(userId: string, projectId: string, milestoneId: string) {
    const { count } = await this.prisma.projectMilestone.deleteMany({ where: { id: milestoneId, projectId, project: { userId } } });
    if (count === 0) throw new NotFoundException('Milestone not found');
    return this.get(userId, projectId);
  }
}

@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List projects (archived hidden unless filtered)' })
  @ApiZodQuery(listProjectsQuerySchema)
  list(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(listProjectsQuerySchema)) q: ListProjectsQuery) {
    return this.projects.list(user.userId, q);
  }

  @Post()
  @ApiZodBody(createProjectSchema)
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createProjectSchema)) body: CreateProject) {
    return this.projects.create(user.userId, body);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.projects.get(user.userId, id);
  }

  @Patch(':id')
  @ApiZodBody(updateProjectSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) body: UpdateProject,
  ) {
    return this.projects.update(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a project (its tasks are kept, unassigned)' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.projects.remove(user.userId, id);
  }

  @Post(':id/milestones')
  @ApiZodBody(createMilestoneSchema)
  addMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(createMilestoneSchema)) body: CreateMilestone,
  ) {
    return this.projects.addMilestone(user.userId, id, body);
  }

  @Patch(':id/milestones/:milestoneId')
  @ApiZodBody(updateMilestoneSchema)
  updateMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
    @Body(new ZodValidationPipe(updateMilestoneSchema)) body: UpdateMilestone,
  ) {
    return this.projects.updateMilestone(user.userId, id, milestoneId, body);
  }

  @Delete(':id/milestones/:milestoneId')
  removeMilestone(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('milestoneId', new ParseUUIDPipe()) milestoneId: string,
  ) {
    return this.projects.removeMilestone(user.userId, id, milestoneId);
  }
}

@Module({ controllers: [ProjectsController], providers: [ProjectsService] })
export class ProjectsModule {}
