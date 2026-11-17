/**
 * Phase 1 slice of the Tasks module: the quick-add and status toggle that the
 * My Day dashboard needs. Full CRUD, subtasks, dependencies and recurrence
 * arrive in Phase 2 (see docs/roadmap.md).
 */
import {
  Body,
  Controller,
  Injectable,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DEFAULT_TIMEZONE, localDateKey } from '@lifeos/shared';
import {
  quickAddTaskSchema,
  setTaskStatusSchema,
  type SetTaskStatusInput,
  type z,
} from '@lifeos/validation';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators';
import { ApiZodBody } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async quickAdd(userId: string, input: z.output<typeof quickAddTaskSchema>) {
    let plannedDate = input.plannedDate;
    if (!plannedDate) {
      const prefs = await this.prisma.userPreferences.findUnique({ where: { userId } });
      plannedDate = localDateKey(new Date(), prefs?.timezone ?? DEFAULT_TIMEZONE);
    }
    return this.prisma.task.create({
      data: {
        userId,
        title: input.title,
        priority: input.priority,
        estimatedMinutes: input.estimatedMinutes ?? null,
        plannedDate: new Date(`${plannedDate}T00:00:00Z`),
      },
      select: { id: true, title: true, status: true, priority: true, plannedDate: true },
    });
  }

  async setStatus(userId: string, taskId: string, input: SetTaskStatusInput) {
    // Ownership is part of the WHERE clause: another user's id yields 404, not 403,
    // so task ids can't be probed (IDOR protection).
    const { count } = await this.prisma.task.updateMany({
      where: { id: taskId, userId },
      data: {
        status: input.status,
        completedAt: input.status === 'COMPLETED' ? new Date() : null,
        version: { increment: 1 },
      },
    });
    if (count === 0) throw new NotFoundException('Task not found');
    return this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      select: { id: true, status: true, completedAt: true, version: true },
    });
  }
}

@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Post()
  @ApiOperation({ summary: 'Quick-add a task (defaults to today in your timezone)' })
  @ApiZodBody(quickAddTaskSchema)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(quickAddTaskSchema)) body: z.output<typeof quickAddTaskSchema>,
  ) {
    return this.tasks.quickAdd(user.userId, body);
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
}

@Module({ controllers: [TasksController], providers: [TasksService] })
export class TasksModule {}
