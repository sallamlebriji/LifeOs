/**
 * Planner: AI proposes → deterministic engine validates → user approves.
 *
 * Nothing here writes to the calendar except `apply`, which runs only on an
 * explicit user request, inside one transaction, after re-checking that the
 * calendar and tasks are exactly as they were when the proposal was computed.
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { type AiProvider, AiOutputError, AiProviderError, createProvider, extractPlanningIntent } from '@lifeos/ai';
import { type Prisma } from '@lifeos/database';
import { type Activity, type BusyBlock, schedule, type WeeklyRule } from '@lifeos/scheduling-engine';
import { addDaysKey, localDateKey, localTimeOnDay, type TimeOfDayValue } from '@lifeos/shared';
import { type ChangeDecisionInput, type PlanRequest, planRequestSchema } from '@lifeos/validation';
import { AuditService } from '../audit/audit.service';
import { occurrencesIn } from '../calendar/calendar.module';
import { CalendarService } from '../calendar/calendar.module';
import { AppConfig } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { type ChatResponse, type ProposalDto, toProposalDto } from './planner.dto';

type Tx = Prisma.TransactionClient;
type Db = PrismaService | Tx;

const LIVE_TASK_STATUSES = ['TODO', 'IN_PROGRESS'] as const;

interface Context {
  timezone: string;
  periodStart: Date;
  periodEnd: Date;
  busy: BusyBlock[];
  weeklyRules: WeeklyRule[];
  unavailable: Array<{ start: Date; end: Date; reason?: string }>;
  activities: Activity[];
  skipped: string[];
  fingerprint: string;
  prefs: NonNullable<Awaited<ReturnType<PrismaService['userPreferences']['findUnique']>>>;
}

@Injectable()
export class PlannerService {
  private readonly logger = new Logger(PlannerService.name);
  private readonly provider: AiProvider | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly calendar: CalendarService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {
    this.provider = createProvider({
      AI_PROVIDER: config.get('AI_PROVIDER'),
      AI_MODEL: config.get('AI_MODEL'),
      OPENAI_API_KEY: config.get('OPENAI_API_KEY'),
      OPENAI_BASE_URL: config.get('OPENAI_BASE_URL'),
    });
  }

  status() {
    return { aiConfigured: !!this.provider, provider: this.provider?.name ?? null, model: this.provider?.model ?? null };
  }

  // ─── Context ──────────────────────────────────────────────────────────

  /**
   * Everything the engine needs, plus a fingerprint of the rows it depends on.
   * Re-running this at approval time detects any change made in between.
   */
  private async context(db: Db, userId: string, req: PlanRequest): Promise<Context> {
    const prefs = await db.userPreferences.findUniqueOrThrow({ where: { userId } });
    const tz = prefs.timezone;
    const at = (key: string, clock: string) => localTimeOnDay(new Date(`${key}T12:00:00Z`), clock, tz);
    const periodStart = at(req.startDate, '00:00');
    const periodEnd = at(addDaysKey(req.endDate, 1), '00:00');
    const range = { start: periodStart, end: periodEnd };

    const [eventRows, blocks, rules, trips, tasks] = await Promise.all([
      this.calendar.rowsFor(userId, range, db),
      db.taskSchedule.findMany({
        where: { userId, status: { not: 'CANCELLED' }, startAt: { lt: periodEnd }, endAt: { gt: periodStart } },
        include: { task: { select: { title: true } } },
        orderBy: { id: 'asc' },
      }),
      db.availabilityRule.findMany({ where: { userId, active: true }, orderBy: { id: 'asc' } }),
      db.trip.findMany({
        where: { userId, blocksCalendar: true, status: { not: 'CANCELLED' }, departureAt: { lt: periodEnd }, returnAt: { gt: periodStart } },
        orderBy: { id: 'asc' },
      }),
      db.task.findMany({
        where: {
          userId,
          status: { in: [...LIVE_TASK_STATUSES] },
          ...(req.taskIds?.length ? { id: { in: req.taskIds } } : req.includeOpenTasks ? {} : { id: { in: [] } }),
        },
        include: {
          category: { select: { kind: true } },
          goal: { select: { status: true, priority: true } },
          dependsOn: { include: { dependsOn: { select: { title: true, status: true } } } },
          schedules: { where: { status: 'PLANNED', endAt: { gt: new Date() } }, select: { id: true } },
          _count: { select: { subtasks: true } },
        },
        orderBy: { id: 'asc' },
        take: 200,
      }),
    ]);

    if (req.taskIds?.length && tasks.length !== new Set(req.taskIds).size) {
      throw new BadRequestException({ statusCode: 400, error: 'Bad Request', message: 'Some tasks were not found or are already done' });
    }

    const occurrences = occurrencesIn(eventRows, range);
    const busy: BusyBlock[] = [
      ...occurrences.map((e) => ({ id: `event:${e.id}@${e.startAt}`, title: e.title, start: new Date(e.startAt), end: new Date(e.endAt), locked: e.locked || e.flexibility === 'FIXED', kind: 'event' as const })),
      ...blocks.map((b) => ({ id: `block:${b.id}`, title: b.task.title, start: b.startAt, end: b.endAt, locked: b.locked, kind: 'task-block' as const })),
    ];
    const weeklyRules: WeeklyRule[] = rules
      .filter((r) => r.weekday !== null && r.startTime && r.endTime)
      .map((r) => ({ kind: r.kind, weekday: r.weekday!, startTime: r.startTime!, endTime: r.endTime! }));
    const unavailable = [
      ...rules.filter((r) => r.startsAt && r.endsAt && r.kind === 'UNAVAILABLE').map((r) => ({ start: r.startsAt!, end: r.endsAt!, reason: r.label ?? 'Unavailable' })),
      ...trips.map((t) => ({ start: t.departureAt, end: t.returnAt, reason: `Trip: ${t.title}` })),
    ];

    const skipped: string[] = [];
    const activities: Activity[] = [];
    for (const t of tasks) {
      const remaining = (t.estimatedMinutes ?? 0) - (t.actualMinutes ?? 0);
      const blockedBy = t.dependsOn.filter((d) => d.dependsOn.status !== 'COMPLETED' && d.dependsOn.status !== 'CANCELLED');
      if (!t.estimatedMinutes) skipped.push(`“${t.title}” has no time estimate.`);
      else if (t._count.subtasks > 0 && !req.taskIds?.includes(t.id)) continue; // parent tasks are planned through their subtasks
      else if (remaining < 15) skipped.push(`“${t.title}” has less than 15 minutes left.`);
      else if (t.schedules.length) skipped.push(`“${t.title}” is already scheduled.`);
      else if (blockedBy.length) skipped.push(`“${t.title}” is waiting on “${blockedBy[0]!.dependsOn.title}”.`);
      else
        activities.push({
          id: t.id,
          title: t.title,
          kind: 'task',
          durationMinutes: Math.round(remaining / 15) * 15,
          splittable: t.splittable,
          minSessionMinutes: t.minSessionMinutes,
          deadline: t.dueAt,
          priority: t.priority,
          goalImportance: t.goal && t.goal.status === 'ACTIVE' ? (t.goal.priority === 'URGENT' || t.goal.priority === 'HIGH' ? 1 : 0.6) : 0,
          preferredTimeOfDay: t.preferredTimeOfDay as TimeOfDayValue,
          window: t.category?.kind === 'WORK' || t.category?.kind === 'STUDY' ? 'work' : 'any',
          fixedStart: t.schedulingMode === 'FIXED' ? t.fixedStartAt : null,
        });
    }
    req.activities.forEach((a, i) =>
      activities.push({
        id: `activity:${i}`,
        title: a.title,
        kind: 'activity',
        durationMinutes: a.durationMinutes,
        sessions: a.sessions,
        priority: 'MEDIUM',
        preferredTimeOfDay: a.preferredTimeOfDay,
        window: a.window,
        recoveryHours: a.recoveryHours,
      }),
    );

    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          prefs: prefs.updatedAt.toISOString(),
          events: eventRows.map((e) => `${e.id}:${e.version}`).sort(),
          blocks: blocks.map((b) => `${b.id}:${b.version}`),
          rules: rules.map((r) => `${r.id}:${r.updatedAt.toISOString()}`),
          trips: trips.map((t) => `${t.id}:${t.updatedAt.toISOString()}`),
          tasks: tasks.map((t) => `${t.id}:${t.version}`),
        }),
      )
      .digest('hex');

    return { timezone: tz, periodStart, periodEnd, busy, weeklyRules, unavailable, activities, skipped, fingerprint, prefs };
  }

  // ─── Proposals ────────────────────────────────────────────────────────

  async propose(userId: string, req: PlanRequest, opts: { supersedes?: { id: string; revision: number } } = {}): Promise<ProposalDto> {
    const ctx = await this.context(this.prisma, userId, req);
    const p = ctx.prefs;
    const weights = p.schedulingWeights && typeof p.schedulingWeights === 'object' ? (p.schedulingWeights as Record<string, number>) : null;
    const result = schedule({
      period: { startDate: req.startDate, endDate: req.endDate },
      timezone: ctx.timezone,
      now: new Date(),
      preferences: {
        dayStartTime: p.dayStartTime,
        dayEndTime: p.dayEndTime,
        workStartTime: p.workStartTime,
        workEndTime: p.workEndTime,
        workDays: Array.isArray(p.workDays) ? (p.workDays as number[]) : [1, 2, 3, 4, 5],
        bufferMinutes: p.bufferMinutes,
        minSessionMinutes: p.minSessionMinutes,
        maxDailyFocusMinutes: p.maxDailyFocusMinutes,
        preferredFocusTime: p.preferredFocusTime,
        weights,
      },
      busy: ctx.busy,
      unavailable: ctx.unavailable,
      weeklyRules: ctx.weeklyRules,
      activities: ctx.activities,
    });
    if (result.violations.length) {
      // The engine verifies itself; a violation is a bug, never something to show as a plan.
      this.logger.error(`Scheduling engine violations: ${result.violations.join('; ')}`);
      throw new InternalServerErrorException('The planner produced an invalid schedule. Nothing was saved.');
    }

    const activityById = new Map(ctx.activities.map((a) => [a.id, a]));
    const taskVersions = new Map(
      (await this.prisma.task.findMany({ where: { userId, id: { in: ctx.activities.filter((a) => a.kind === 'task').map((a) => a.id) } }, select: { id: true, version: true } })).map((t) => [t.id, t.version]),
    );
    const reqActivities = req.activities;
    const changes: Prisma.PlanningChangeCreateWithoutProposalInput[] = [
      ...result.scheduled.map((s, i) => {
        const a = activityById.get(s.activityId)!;
        const isTask = a.kind === 'task';
        const extra = isTask ? null : reqActivities[Number(s.activityId.split(':')[1])];
        return {
          type: isTask ? ('SCHEDULE_TASK' as const) : ('CREATE_EVENT' as const),
          title: a.sessions && a.sessions > 1 ? `${a.title} (${s.index + 1}/${a.sessions})` : a.title,
          targetTaskId: isTask ? a.id : null,
          targetVersion: isTask ? (taskVersions.get(a.id) ?? null) : null,
          startAt: s.start,
          endAt: s.end,
          after: { start: s.start.toISOString(), end: s.end.toISOString(), ...(extra?.category ? { categoryKind: extra.category } : {}) },
          reason: s.reasons.join(' · ') || null,
          sortOrder: i,
        };
      }),
      ...result.unscheduled.map((u, i) => ({
        type: 'UNSCHEDULED' as const,
        title: u.title,
        targetTaskId: activityById.get(u.activityId)?.kind === 'task' ? u.activityId : null,
        reason: `${u.reason}: ${u.suggestion}`,
        after: { minutesRequested: u.minutesRequested, minutesPlaced: u.minutesPlaced, reason: u.reason },
        sortOrder: 10_000 + i,
      })),
    ];

    const ttl = this.config.get('PROPOSAL_TTL_HOURS');
    const created = await this.prisma.$transaction(async (tx) => {
      if (opts.supersedes) {
        await tx.planningProposal.updateMany({ where: { id: opts.supersedes.id, userId, status: 'PENDING' }, data: { status: 'SUPERSEDED', decidedAt: new Date() } });
      }
      return tx.planningProposal.create({
        data: {
          userId,
          conversationId: req.conversationId ?? null,
          supersedesId: opts.supersedes?.id ?? null,
          revision: (opts.supersedes?.revision ?? 0) + 1,
          periodStart: ctx.periodStart,
          periodEnd: ctx.periodEnd,
          request: req as unknown as Prisma.InputJsonValue,
          summary: req.note ?? null,
          explanation: {
            lines: [...result.explanations, ...ctx.skipped],
            dailyWorkload: result.dailyWorkload,
            freeMinutes: result.freeMinutes,
            existingConflicts: result.conflicts.length,
          },
          unscheduled: result.unscheduled as unknown as Prisma.InputJsonValue,
          score: result.score,
          baseFingerprint: ctx.fingerprint,
          expiresAt: new Date(Date.now() + ttl * 3_600_000),
          changes: { create: changes },
        },
        include: { changes: { orderBy: { sortOrder: 'asc' } } },
      });
    });
    await this.audit.record({ userId, action: 'proposal.created', entityType: 'PlanningProposal', entityId: created.id, metadata: { changes: changes.length } });
    return toProposalDto(created);
  }

  private async load(userId: string, id: string, db: Db = this.prisma) {
    const p = await db.planningProposal.findFirst({ where: { id, userId }, include: { changes: { orderBy: { sortOrder: 'asc' } } } });
    if (!p) throw new NotFoundException('Proposal not found');
    if (p.status === 'PENDING' && p.expiresAt < new Date()) {
      await db.planningProposal.update({ where: { id }, data: { status: 'EXPIRED' } });
      p.status = 'EXPIRED';
    }
    return p;
  }

  async get(userId: string, id: string) {
    return toProposalDto(await this.load(userId, id));
  }

  async list(userId: string) {
    await this.prisma.planningProposal.updateMany({ where: { userId, status: 'PENDING', expiresAt: { lt: new Date() } }, data: { status: 'EXPIRED' } });
    const rows = await this.prisma.planningProposal.findMany({
      where: { userId },
      include: { changes: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return rows.map(toProposalDto);
  }

  private pending<T extends { status: string }>(p: T): T {
    if (p.status !== 'PENDING') {
      throw new ConflictException({ statusCode: 409, error: 'Conflict', message: `This proposal is ${p.status.toLowerCase()} and can no longer change.` });
    }
    return p;
  }

  async decide(userId: string, proposalId: string, changeId: string, input: ChangeDecisionInput) {
    const p = this.pending(await this.load(userId, proposalId));
    const change = p.changes.find((c) => c.id === changeId);
    if (!change) throw new NotFoundException('Change not found');
    if (change.type === 'UNSCHEDULED') throw new BadRequestException('Unscheduled items have nothing to accept');

    let startAt = change.startAt;
    let endAt = change.endAt;
    if (input.decision === 'MODIFIED') {
      startAt = new Date(input.startAt!);
      endAt = new Date(input.endAt!);
      // A modified slot must still respect hard constraints: no overlap with existing blocks or other accepted changes.
      const range = { start: new Date(startAt.getTime() - 1), end: new Date(endAt.getTime() + 1) };
      const events = occurrencesIn(await this.calendar.rowsFor(userId, range), range).filter((e) => !e.allDay);
      const blocks = await this.prisma.taskSchedule.findMany({
        where: { userId, status: { not: 'CANCELLED' }, startAt: { lt: endAt }, endAt: { gt: startAt } },
        include: { task: { select: { title: true } } },
      });
      const others = p.changes.filter((c) => c.id !== changeId && c.type !== 'UNSCHEDULED' && c.decision !== 'REJECTED' && c.startAt && c.endAt);
      const clash = [
        ...events.filter((e) => new Date(e.startAt) < endAt! && new Date(e.endAt) > startAt!).map((e) => e.title),
        ...blocks.map((b) => b.task.title),
        ...others.filter((c) => c.startAt! < endAt! && c.endAt! > startAt!).map((c) => c.title),
      ];
      if (clash.length) {
        throw new ConflictException({ statusCode: 409, error: 'Conflict', message: `That time overlaps ${clash.slice(0, 3).join(', ')}.` });
      }
    }
    await this.prisma.planningChange.update({ where: { id: changeId }, data: { decision: input.decision, startAt, endAt } });
    return this.get(userId, proposalId);
  }

  /** Applies every change that wasn't rejected, atomically, after re-validating the base state. */
  async apply(userId: string, id: string, ip?: string) {
    const applied = await this.prisma.$transaction(
      async (tx) => {
        const p = this.pending(await this.load(userId, id, tx));
        const req = planRequestSchema.parse(p.request);
        const ctx = await this.context(tx, userId, req);
        if (ctx.fingerprint !== p.baseFingerprint) {
          throw new ConflictException({
            statusCode: 409,
            error: 'Conflict',
            code: 'STALE_PROPOSAL',
            message: 'Your calendar or tasks changed since this plan was made. Regenerate it to plan around the changes.',
          });
        }
        const toApply = p.changes.filter((c) => c.type !== 'UNSCHEDULED' && c.decision !== 'REJECTED' && c.startAt && c.endAt);
        for (const c of toApply) {
          if (c.type === 'SCHEDULE_TASK' && c.targetTaskId) {
            const { count } = await tx.task.updateMany({
              where: { id: c.targetTaskId, userId, version: c.targetVersion ?? -1, status: { in: [...LIVE_TASK_STATUSES] } },
              data: { version: { increment: 1 } },
            });
            if (count === 0) {
              throw new ConflictException({ statusCode: 409, error: 'Conflict', code: 'STALE_PROPOSAL', message: `“${c.title}” changed since this plan was made. Regenerate it.` });
            }
            await tx.taskSchedule.create({ data: { userId, taskId: c.targetTaskId, startAt: c.startAt!, endAt: c.endAt!, source: 'AI', proposalId: p.id } });
          } else if (c.type === 'CREATE_EVENT') {
            const after = (c.after ?? {}) as { categoryKind?: string };
            const category = after.categoryKind
              ? await tx.category.findFirst({ where: { userId, kind: after.categoryKind as never }, select: { id: true } })
              : null;
            await tx.calendarEvent.create({
              data: {
                userId,
                title: c.title,
                startAt: c.startAt!,
                endAt: c.endAt!,
                timezone: ctx.timezone,
                flexibility: 'FLEXIBLE',
                source: 'AI',
                proposalId: p.id,
                categoryId: category?.id ?? null,
              },
            });
          }
          if (c.decision === 'PROPOSED') await tx.planningChange.update({ where: { id: c.id }, data: { decision: 'ACCEPTED' } });
        }
        const { count } = await tx.planningProposal.updateMany({
          where: { id: p.id, userId, status: 'PENDING', version: p.version },
          data: { status: 'APPLIED', appliedAt: new Date(), decidedAt: new Date(), version: { increment: 1 } },
        });
        if (count === 0) throw new ConflictException('This proposal was already decided.');
        return toApply.length;
      },
      { timeout: 20_000 },
    );
    await this.audit.record({ userId, action: 'proposal.applied', entityType: 'PlanningProposal', entityId: id, ipAddress: ip, metadata: { applied } });
    return this.get(userId, id);
  }

  async reject(userId: string, id: string) {
    this.pending(await this.load(userId, id));
    await this.prisma.planningProposal.updateMany({ where: { id, userId, status: 'PENDING' }, data: { status: 'REJECTED', decidedAt: new Date() } });
    await this.audit.record({ userId, action: 'proposal.rejected', entityType: 'PlanningProposal', entityId: id });
    return this.get(userId, id);
  }

  async regenerate(userId: string, id: string) {
    const p = await this.load(userId, id);
    if (p.status !== 'PENDING' && p.status !== 'EXPIRED' && p.status !== 'REJECTED') {
      throw new ConflictException({ statusCode: 409, error: 'Conflict', message: `A ${p.status.toLowerCase()} proposal can’t be regenerated.` });
    }
    const req = planRequestSchema.parse(p.request);
    return this.propose(userId, req, { supersedes: { id: p.id, revision: p.revision } });
  }

  /** Removes what an applied proposal created, if those rows weren't edited since. */
  async revert(userId: string, id: string) {
    const p = await this.load(userId, id);
    if (p.status !== 'APPLIED') throw new ConflictException({ statusCode: 409, error: 'Conflict', message: 'Only an applied proposal can be undone.' });
    const removed = await this.prisma.$transaction(async (tx) => {
      const edited = await tx.calendarEvent.count({ where: { userId, proposalId: id, version: { gt: 1 } } });
      if (edited) throw new ConflictException({ statusCode: 409, error: 'Conflict', message: 'Some planned events were edited since; delete them individually instead.' });
      const events = await tx.calendarEvent.deleteMany({ where: { userId, proposalId: id } });
      const blocks = await tx.taskSchedule.deleteMany({ where: { userId, proposalId: id } });
      await tx.planningProposal.update({ where: { id }, data: { status: 'REVERTED', version: { increment: 1 } } });
      return events.count + blocks.count;
    });
    await this.audit.record({ userId, action: 'proposal.reverted', entityType: 'PlanningProposal', entityId: id, metadata: { removed } });
    return this.get(userId, id);
  }

  // ─── Conversation (AI) ────────────────────────────────────────────────

  async chat(userId: string, message: string, conversationId?: string): Promise<ChatResponse> {
    if (!this.provider) {
      throw new ServiceUnavailableException({
        statusCode: 503,
        error: 'Service Unavailable',
        code: 'AI_NOT_CONFIGURED',
        message: 'The AI assistant isn’t configured on this server. Use the planning form instead.',
      });
    }
    const conversation = conversationId
      ? await this.prisma.aIConversation.findFirst({ where: { id: conversationId, userId } })
      : await this.prisma.aIConversation.create({ data: { userId, title: message.slice(0, 80) } });
    if (!conversation) throw new NotFoundException('Conversation not found');

    await this.prisma.aIMessage.create({ data: { conversationId: conversation.id, role: 'USER', content: message } });
    const history = await this.prisma.aIMessage.findMany({
      where: { conversationId: conversation.id, role: { in: ['USER', 'ASSISTANT'] } },
      orderBy: { createdAt: 'asc' },
      take: 24,
    });
    const prefs = await this.prisma.userPreferences.findUniqueOrThrow({ where: { userId } });
    const now = new Date();
    const today = localDateKey(now, prefs.timezone);
    const openTasks = await this.prisma.task.findMany({
      where: { userId, status: { in: [...LIVE_TASK_STATUSES] } },
      select: { id: true, title: true },
      orderBy: [{ priority: 'desc' }, { id: 'asc' }],
      take: 60,
    });

    let intent;
    try {
      intent = await extractPlanningIntent(
        this.provider,
        {
          today,
          weekday: new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: prefs.timezone }).format(now),
          timezone: prefs.timezone,
          locale: prefs.locale,
          openTaskTitles: openTasks.map((t) => t.title),
        },
        history.map((m) => ({ role: m.role === 'USER' ? ('user' as const) : ('assistant' as const), content: m.content })),
      );
    } catch (err) {
      if (err instanceof AiOutputError || err instanceof AiProviderError) {
        this.logger.warn(`AI request failed: ${err.message}`);
        throw new ServiceUnavailableException({ statusCode: 503, error: 'Service Unavailable', code: 'AI_FAILED', message: 'The AI assistant couldn’t answer right now. Try again or use the planning form.' });
      }
      throw err;
    }

    const data = intent.data;
    const reply = data.intent === 'create_plan' ? data.summary : data.question;
    await this.prisma.aIMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'ASSISTANT',
        content: reply,
        structured: data as unknown as Prisma.InputJsonValue,
        provider: this.provider.name,
        model: intent.model,
        promptTokens: intent.usage.promptTokens,
        completionTokens: intent.usage.completionTokens,
      },
    });
    await this.prisma.aIConversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });

    if (data.intent === 'ask_clarification') return { conversationId: conversation.id, reply, proposal: null };

    // Resolve titles to the user's own task ids; unknown titles are ignored, never created.
    const byTitle = new Map(openTasks.map((t) => [t.title.trim().toLowerCase(), t.id]));
    const taskIds = data.taskTitles.map((t) => byTitle.get(t.trim().toLowerCase())).filter((x): x is string => !!x);
    const parsed = planRequestSchema.safeParse({
      startDate: data.startDate < today ? today : data.startDate,
      endDate: data.endDate,
      includeOpenTasks: data.includeOpenTasks && taskIds.length === 0,
      ...(taskIds.length ? { taskIds } : {}),
      activities: data.activities,
      conversationId: conversation.id,
      note: data.summary,
    });
    if (!parsed.success) {
      const question = parsed.error.issues[0]?.message ?? 'Could you clarify the period to plan?';
      return { conversationId: conversation.id, reply: question, proposal: null };
    }
    const proposal = await this.propose(userId, parsed.data);
    return { conversationId: conversation.id, reply, proposal };
  }

  async conversation(userId: string, id: string) {
    const c = await this.prisma.aIConversation.findFirst({
      where: { id, userId },
      include: { messages: { where: { role: { in: ['USER', 'ASSISTANT'] } }, orderBy: { createdAt: 'asc' }, select: { id: true, role: true, content: true, createdAt: true } } },
    });
    if (!c) throw new NotFoundException('Conversation not found');
    return { id: c.id, title: c.title, messages: c.messages.map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })) };
  }
}
