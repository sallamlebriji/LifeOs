/**
 * Calendar: events in a range (recurring series expanded in the event's own
 * timezone), conflict detection, locked/flexible events, and availability rules.
 *
 * Recurring events are edited as a series: moving an occurrence in the UI sends
 * the shifted series start/end. Locked events can't be moved until unlocked.
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
  type AvailabilityRuleDto,
  type CalendarEventDto,
  type CalendarRangeResponse,
  type ConflictDto,
  type EventMutationResponse,
  expandRecurrence,
  findConflicts,
  type UtcRange,
} from '@lifeos/shared';
import {
  availabilityRuleSchema,
  calendarRangeQuerySchema,
  type CalendarRangeQuery,
  createEventSchema,
  updateEventSchema,
  type z,
} from '@lifeos/validation';
import { AuditService } from '../audit/audit.service';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators';
import { assertOwnedRefs, categorySelect, iso, userTimezone, versionedMiss } from '../common/module-helpers';
import { ApiZodBody, ApiZodQuery } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

type CreateEvent = z.output<typeof createEventSchema>;
type UpdateEvent = z.output<typeof updateEventSchema>;
type AvailabilityInput = z.output<typeof availabilityRuleSchema>;

const eventInclude = { category: categorySelect } satisfies Prisma.CalendarEventInclude;
export type EventRow = Prisma.CalendarEventGetPayload<{ include: typeof eventInclude }>;

const CONFLICT_HORIZON_MS = 28 * 86_400_000;

function toEventDto(e: EventRow, occurrence?: { start: Date; end: Date }): CalendarEventDto {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    location: e.location,
    startAt: (occurrence?.start ?? e.startAt).toISOString(),
    endAt: (occurrence?.end ?? e.endAt).toISOString(),
    allDay: e.allDay,
    timezone: e.timezone,
    recurrenceRule: e.recurrenceRule,
    seriesStartAt: e.startAt.toISOString(),
    isOccurrence: !!occurrence && occurrence.start.getTime() !== e.startAt.getTime(),
    priority: e.priority,
    flexibility: e.flexibility,
    locked: e.locked,
    color: e.color,
    source: e.source,
    category: e.category,
    projectId: e.projectId,
    version: e.version,
  };
}

/** Expands series rows into concrete occurrences overlapping `range`. */
export function occurrencesIn(rows: EventRow[], range: UtcRange): CalendarEventDto[] {
  const out: CalendarEventDto[] = [];
  for (const e of rows) {
    if (!e.recurrenceRule) {
      if (e.startAt < range.end && e.endAt > range.start) out.push(toEventDto(e));
      continue;
    }
    for (const occ of expandRecurrence({ rule: e.recurrenceRule, start: e.startAt, end: e.endAt, timeZone: e.timezone, range })) {
      out.push(toEventDto(e, occ));
    }
  }
  return out.sort((a, b) => a.startAt.localeCompare(b.startAt) || a.title.localeCompare(b.title));
}

function occurrenceKey(e: CalendarEventDto) {
  return `${e.id}@${e.startAt}`;
}

export function conflictsAmong(events: CalendarEventDto[]): ConflictDto[] {
  const timed = events.filter((e) => !e.allDay);
  const byKey = new Map(timed.map((e) => [occurrenceKey(e), e]));
  return findConflicts(timed.map((e) => ({ id: occurrenceKey(e), start: new Date(e.startAt), end: new Date(e.endAt) })))
    .filter((c) => c.a.split('@')[0] !== c.b.split('@')[0])
    .map((c) => {
      const a = byKey.get(c.a)!;
      const b = byKey.get(c.b)!;
      return {
        a: { id: a.id, title: a.title, startAt: a.startAt },
        b: { id: b.id, title: b.title, startAt: b.startAt },
        start: c.start.toISOString(),
        end: c.end.toISOString(),
        overlapMinutes: c.overlapMinutes,
      };
    });
}

function toRuleDto(r: {
  id: string;
  kind: AvailabilityRuleDto['kind'];
  label: string | null;
  weekday: number | null;
  startTime: string | null;
  endTime: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string;
  active: boolean;
}): AvailabilityRuleDto {
  return { ...r, startsAt: iso(r.startsAt), endsAt: iso(r.endsAt) };
}

@Injectable()
export class CalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Series rows that may produce occurrences in `range`. */
  async rowsFor(userId: string, range: UtcRange): Promise<EventRow[]> {
    return this.prisma.calendarEvent.findMany({
      where: {
        userId,
        OR: [
          { recurrenceRule: null, startAt: { lt: range.end }, endAt: { gt: range.start } },
          { recurrenceRule: { not: null }, startAt: { lt: range.end } },
        ],
      },
      include: eventInclude,
      orderBy: { startAt: 'asc' },
      take: 2000,
    });
  }

  async range(userId: string, q: CalendarRangeQuery): Promise<CalendarRangeResponse> {
    const range = { start: q.from, end: q.to };
    const events = occurrencesIn(await this.rowsFor(userId, range), range);
    return { events, conflicts: conflictsAmong(events) };
  }

  /** Other events overlapping any occurrence of `event` within the next four weeks of it. */
  private async conflictsFor(userId: string, event: EventRow): Promise<EventMutationResponse['conflicts']> {
    if (event.allDay) return [];
    const window = { start: event.startAt, end: new Date(event.startAt.getTime() + CONFLICT_HORIZON_MS) };
    if (!event.recurrenceRule) window.end = event.endAt;
    const all = occurrencesIn(await this.rowsFor(userId, window), window);
    const mine = all.filter((e) => e.id === event.id);
    const seen = new Map<string, EventMutationResponse['conflicts'][number]>();
    for (const other of all) {
      if (other.id === event.id || other.allDay || seen.has(other.id)) continue;
      if (mine.some((m) => m.startAt < other.endAt && m.endAt > other.startAt)) {
        seen.set(other.id, { id: other.id, title: other.title, startAt: other.startAt, endAt: other.endAt });
      }
    }
    return [...seen.values()];
  }

  async get(userId: string, id: string): Promise<CalendarEventDto> {
    const e = await this.prisma.calendarEvent.findFirst({ where: { id, userId }, include: eventInclude });
    if (!e) throw new NotFoundException('Event not found');
    return toEventDto(e);
  }

  async create(userId: string, input: CreateEvent): Promise<EventMutationResponse> {
    await assertOwnedRefs(this.prisma, userId, { categoryId: input.categoryId, projectId: input.projectId });
    const timezone = input.timezone ?? (await userTimezone(this.prisma, userId)).timezone;
    const e = await this.prisma.calendarEvent.create({
      data: {
        userId,
        title: input.title,
        description: input.description ?? null,
        location: input.location ?? null,
        startAt: input.startAt,
        endAt: input.endAt,
        allDay: input.allDay,
        timezone,
        recurrenceRule: input.recurrenceRule ?? null,
        priority: input.priority,
        flexibility: input.flexibility,
        locked: input.locked,
        color: input.color ?? null,
        categoryId: input.categoryId ?? null,
        projectId: input.projectId ?? null,
        source: 'MANUAL',
      },
      include: eventInclude,
    });
    return { event: toEventDto(e), conflicts: await this.conflictsFor(userId, e) };
  }

  async update(userId: string, id: string, input: UpdateEvent): Promise<EventMutationResponse> {
    const current = await this.prisma.calendarEvent.findFirst({ where: { id, userId } });
    if (!current) throw new NotFoundException('Event not found');
    await assertOwnedRefs(this.prisma, userId, { categoryId: input.categoryId, projectId: input.projectId });

    const startAt = input.startAt ?? current.startAt;
    const endAt = input.endAt ?? current.endAt;
    if (endAt <= startAt) {
      const message = 'End must be after start';
      throw new BadRequestException({ statusCode: 400, error: 'Bad Request', message, issues: { endAt: [message] } });
    }
    const moves = startAt.getTime() !== current.startAt.getTime() || endAt.getTime() !== current.endAt.getTime();
    if (current.locked && moves && input.locked !== false) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message: 'This event is locked. Unlock it before changing its time.',
      });
    }

    const { version, ...rest } = input;
    const { count } = await this.prisma.calendarEvent.updateMany({
      where: { id, userId, version },
      data: { ...rest, version: { increment: 1 } },
    });
    if (count === 0) await versionedMiss(this.prisma.calendarEvent.findFirst({ where: { id, userId } }), 'Event');
    const e = await this.prisma.calendarEvent.findUniqueOrThrow({ where: { id }, include: eventInclude });
    return { event: toEventDto(e), conflicts: await this.conflictsFor(userId, e) };
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.calendarEvent.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Event not found');
    await this.audit.record({ userId, action: 'event.deleted', entityType: 'CalendarEvent', entityId: id });
  }

  // ─── Availability ─────────────────────────────────────────────────────

  async rules(userId: string): Promise<AvailabilityRuleDto[]> {
    const rows = await this.prisma.availabilityRule.findMany({
      where: { userId },
      orderBy: [{ weekday: 'asc' }, { startTime: 'asc' }, { startsAt: 'asc' }],
    });
    return rows.map(toRuleDto);
  }

  private ruleData(input: AvailabilityInput, timezone: string) {
    const recurring = input.weekday !== null && input.weekday !== undefined;
    return {
      kind: input.kind,
      label: input.label ?? null,
      weekday: recurring ? input.weekday! : null,
      startTime: recurring ? input.startTime! : null,
      endTime: recurring ? input.endTime! : null,
      startsAt: recurring ? null : input.startsAt!,
      endsAt: recurring ? null : input.endsAt!,
      timezone: input.timezone ?? timezone,
      active: input.active,
    };
  }

  async createRule(userId: string, input: AvailabilityInput) {
    const { timezone } = await userTimezone(this.prisma, userId);
    const row = await this.prisma.availabilityRule.create({ data: { userId, ...this.ruleData(input, timezone) } });
    return toRuleDto(row);
  }

  async replaceRule(userId: string, id: string, input: AvailabilityInput) {
    const { timezone } = await userTimezone(this.prisma, userId);
    const { count } = await this.prisma.availabilityRule.updateMany({ where: { id, userId }, data: this.ruleData(input, timezone) });
    if (count === 0) throw new NotFoundException('Rule not found');
    return toRuleDto(await this.prisma.availabilityRule.findUniqueOrThrow({ where: { id } }));
  }

  async removeRule(userId: string, id: string) {
    const { count } = await this.prisma.availabilityRule.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Rule not found');
  }
}

@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get('events')
  @ApiOperation({ summary: 'Events overlapping [from, to) with recurring series expanded, plus conflicts (max 62 days)' })
  @ApiZodQuery(calendarRangeQuerySchema)
  range(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(calendarRangeQuerySchema)) q: CalendarRangeQuery) {
    return this.calendar.range(user.userId, q);
  }

  @Post('events')
  @ApiOperation({ summary: 'Create an event; overlapping events are returned as warnings' })
  @ApiZodBody(createEventSchema)
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createEventSchema)) body: CreateEvent) {
    return this.calendar.create(user.userId, body);
  }

  @Get('events/:id')
  get(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.calendar.get(user.userId, id);
  }

  @Patch('events/:id')
  @ApiOperation({ summary: 'Update an event series (send `version`; locked events must be unlocked to move)' })
  @ApiZodBody(updateEventSchema)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateEventSchema)) body: UpdateEvent,
  ) {
    return this.calendar.update(user.userId, id, body);
  }

  @Delete('events/:id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.calendar.remove(user.userId, id);
  }
}

@ApiTags('availability')
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  @ApiOperation({ summary: 'Working hours, unavailable blocks, preferred and protected time' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.calendar.rules(user.userId);
  }

  @Post()
  @ApiZodBody(availabilityRuleSchema)
  create(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(availabilityRuleSchema)) body: AvailabilityInput) {
    return this.calendar.createRule(user.userId, body);
  }

  @Put(':id')
  @ApiZodBody(availabilityRuleSchema)
  replace(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(availabilityRuleSchema)) body: AvailabilityInput,
  ) {
    return this.calendar.replaceRule(user.userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.calendar.removeRule(user.userId, id);
  }
}

@Module({
  controllers: [CalendarController, AvailabilityController],
  providers: [CalendarService],
  exports: [CalendarService],
})
export class CalendarModule {}
