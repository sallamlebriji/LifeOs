/**
 * Study: subjects with chapter outlines, learning/revision/exam sessions, and
 * SM-2 spaced repetition. Completing a learning session on a topic schedules
 * its first review for the next day; each completed revision (rated 0–5)
 * reschedules the topic from its full revision history.
 */
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
import {
  addDaysKey,
  type DueReviewDto,
  localDateKey,
  localTimeOnDay,
  replayReviews,
  startOfWeekKey,
  type StudyChapter,
  type StudySessionDto,
  type StudySubjectDto,
} from '@lifeos/shared';
import {
  completeStudySessionSchema,
  type CompleteStudySessionInput,
  createStudySessionSchema,
  createSubjectSchema,
  updateSubjectSchema,
  z,
} from '@lifeos/validation';
import { type AuthenticatedUser, CurrentUser } from '../common/decorators';
import { userTimezone } from '../common/module-helpers';
import { ApiZodBody, ApiZodQuery } from '../common/swagger';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PrismaService } from '../prisma/prisma.service';

type CreateSubject = z.output<typeof createSubjectSchema>;
type UpdateSubject = z.output<typeof updateSubjectSchema>;
type CreateSession = z.output<typeof createStudySessionSchema>;

const sessionQuerySchema = z.object({ subjectId: z.uuid().optional(), limit: z.coerce.number().int().min(1).max(200).default(50) });

const chapters = (v: Prisma.JsonValue | null): StudyChapter[] => (Array.isArray(v) ? (v as unknown as StudyChapter[]) : []);

type SessionRow = Prisma.StudySessionGetPayload<{ include: { subject: { select: { name: true } } } }>;
function sessionDto(s: SessionRow): StudySessionDto {
  return {
    id: s.id,
    subjectId: s.subjectId,
    subjectName: s.subject.name,
    kind: s.kind,
    topic: s.topic,
    startAt: s.startAt.toISOString(),
    endAt: s.endAt.toISOString(),
    completedAt: s.completedAt?.toISOString() ?? null,
    quality: s.quality,
    intervalDays: s.intervalDays,
    nextReviewAt: s.nextReviewAt?.toISOString() ?? null,
    notes: s.notes,
  };
}

/** Latest scheduled review per (subject, topic) — pure, unit-tested. */
export function dueReviews(
  sessions: Array<{ subjectId: string; subjectName: string; topic: string | null; kind: string; completedAt: Date | null; nextReviewAt: Date | null; quality: number | null }>,
  until: Date,
): DueReviewDto[] {
  const latest = new Map<string, (typeof sessions)[number]>();
  const reps = new Map<string, number[]>();
  for (const s of [...sessions].filter((x) => x.completedAt && x.topic).sort((a, b) => a.completedAt!.getTime() - b.completedAt!.getTime())) {
    const key = `${s.subjectId}\u0000${s.topic!.trim().toLowerCase()}`;
    latest.set(key, s);
    if (s.kind === 'REVISION' && s.quality !== null) reps.set(key, [...(reps.get(key) ?? []), s.quality]);
  }
  const out: DueReviewDto[] = [];
  for (const [key, s] of latest) {
    if (!s.nextReviewAt || s.nextReviewAt > until) continue;
    out.push({
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      topic: s.topic!,
      dueAt: s.nextReviewAt.toISOString(),
      lastQuality: s.kind === 'REVISION' ? s.quality : null,
      repetitions: replayReviews(reps.get(key) ?? []).repetitions,
    });
  }
  return out.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

@Injectable()
export class StudyService {
  constructor(private readonly prisma: PrismaService) {}

  private async endOfToday(userId: string) {
    const { timezone, weekStartsOn } = await userTimezone(this.prisma, userId);
    const today = localDateKey(new Date(), timezone);
    const at = (key: string) => localTimeOnDay(new Date(`${key}T12:00:00Z`), '00:00', timezone);
    return { timezone, today, endOfToday: at(addDaysKey(today, 1)), weekStart: at(startOfWeekKey(today, weekStartsOn)) };
  }

  private async allSessions(userId: string) {
    return this.prisma.studySession.findMany({
      where: { userId },
      include: { subject: { select: { name: true } } },
      orderBy: { startAt: 'asc' },
      take: 5000,
    });
  }

  async subjects(userId: string): Promise<StudySubjectDto[]> {
    const [subjects, sessions, { endOfToday, weekStart }] = await Promise.all([
      this.prisma.studySubject.findMany({ where: { userId }, orderBy: [{ examDate: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }] }),
      this.allSessions(userId),
      this.endOfToday(userId),
    ]);
    const due = dueReviews(sessions.map((s) => ({ ...s, subjectName: s.subject.name })), endOfToday);
    return subjects.map((s) => {
      const list = chapters(s.outline);
      return {
        id: s.id,
        name: s.name,
        description: s.description,
        color: s.color,
        importance: s.importance,
        examDate: s.examDate?.toISOString() ?? null,
        weeklyTargetMinutes: s.weeklyTargetMinutes,
        chapters: list,
        minutesThisWeek: sessions
          .filter((x) => x.subjectId === s.id && x.completedAt && x.startAt >= weekStart)
          .reduce((sum, x) => sum + Math.round((x.endAt.getTime() - x.startAt.getTime()) / 60_000), 0),
        progress: list.length ? list.filter((c) => c.done).length / list.length : 0,
        dueReviews: due.filter((d) => d.subjectId === s.id).length,
      };
    });
  }

  async createSubject(userId: string, input: CreateSubject) {
    const s = await this.prisma.studySubject.create({
      data: {
        userId,
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? null,
        importance: input.importance,
        examDate: input.examDate ?? null,
        weeklyTargetMinutes: input.weeklyTargetMinutes ?? null,
        outline: input.chapters as unknown as Prisma.InputJsonValue,
      },
    });
    return (await this.subjects(userId)).find((x) => x.id === s.id)!;
  }

  async updateSubject(userId: string, id: string, input: UpdateSubject) {
    const { chapters: list, ...rest } = input;
    const { count } = await this.prisma.studySubject.updateMany({
      where: { id, userId },
      data: { ...rest, ...(list ? { outline: list as unknown as Prisma.InputJsonValue } : {}) },
    });
    if (count === 0) throw new NotFoundException('Subject not found');
    return (await this.subjects(userId)).find((x) => x.id === id)!;
  }

  async removeSubject(userId: string, id: string) {
    const { count } = await this.prisma.studySubject.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Subject not found');
  }

  async sessions(userId: string, q: z.infer<typeof sessionQuerySchema>) {
    const rows = await this.prisma.studySession.findMany({
      where: { userId, ...(q.subjectId ? { subjectId: q.subjectId } : {}) },
      include: { subject: { select: { name: true } } },
      orderBy: [{ startAt: 'desc' }, { id: 'asc' }],
      take: q.limit,
    });
    return rows.map(sessionDto);
  }

  /** Spaced-repetition fields for a session completed now. */
  private async srsFields(userId: string, s: { subjectId: string; topic: string | null; kind: string }, quality: number | null | undefined, completedAt: Date, excludeId?: string) {
    if (!s.topic) return {};
    if (s.kind === 'LEARNING') return { intervalDays: 1, easeFactor: 2.5, nextReviewAt: new Date(completedAt.getTime() + 86_400_000) };
    if (s.kind !== 'REVISION' || quality === null || quality === undefined) return {};
    const history = await this.prisma.studySession.findMany({
      where: { userId, subjectId: s.subjectId, kind: 'REVISION', completedAt: { not: null }, quality: { not: null }, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { topic: true, quality: true, completedAt: true },
      orderBy: { completedAt: 'asc' },
    });
    const qualities = history.filter((h) => h.topic?.trim().toLowerCase() === s.topic!.trim().toLowerCase()).map((h) => h.quality!);
    const state = replayReviews([...qualities, quality]);
    return {
      quality,
      easeFactor: state.easeFactor,
      intervalDays: state.intervalDays,
      nextReviewAt: new Date(completedAt.getTime() + state.intervalDays * 86_400_000),
    };
  }

  async createSession(userId: string, input: CreateSession) {
    const subject = await this.prisma.studySubject.findFirst({ where: { id: input.subjectId, userId }, select: { id: true } });
    if (!subject) throw new NotFoundException('Subject not found');
    const completedAt = input.completed ? input.endAt : null;
    const srs = completedAt ? await this.srsFields(userId, { subjectId: input.subjectId, topic: input.topic ?? null, kind: input.kind }, input.quality, completedAt) : {};
    const s = await this.prisma.studySession.create({
      data: {
        userId,
        subjectId: input.subjectId,
        kind: input.kind,
        topic: input.topic ?? null,
        startAt: input.startAt,
        endAt: input.endAt,
        completedAt,
        notes: input.notes ?? null,
        ...srs,
      },
      include: { subject: { select: { name: true } } },
    });
    return sessionDto(s);
  }

  async completeSession(userId: string, id: string, input: CompleteStudySessionInput) {
    const s = await this.prisma.studySession.findFirst({ where: { id, userId } });
    if (!s) throw new NotFoundException('Session not found');
    if (s.kind === 'REVISION' && (input.quality === null || input.quality === undefined)) {
      const message = 'Rate how well you remembered (0–5)';
      throw new BadRequestException({ statusCode: 400, error: 'Bad Request', message, issues: { quality: [message] } });
    }
    const completedAt = s.completedAt ?? new Date();
    const srs = await this.srsFields(userId, s, input.quality, completedAt, s.id);
    const updated = await this.prisma.studySession.update({
      where: { id },
      data: { completedAt, ...(input.notes !== undefined ? { notes: input.notes } : {}), ...srs },
      include: { subject: { select: { name: true } } },
    });
    return sessionDto(updated);
  }

  async removeSession(userId: string, id: string) {
    const { count } = await this.prisma.studySession.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException('Session not found');
  }

  async due(userId: string) {
    const [sessions, { endOfToday }] = await Promise.all([this.allSessions(userId), this.endOfToday(userId)]);
    return dueReviews(sessions.map((s) => ({ ...s, subjectName: s.subject.name })), endOfToday);
  }
}

@ApiTags('study')
@Controller('study')
export class StudyController {
  constructor(private readonly study: StudyService) {}

  @Get('subjects')
  @ApiOperation({ summary: 'Subjects with chapter progress, minutes this week and due reviews' })
  subjects(@CurrentUser() user: AuthenticatedUser) {
    return this.study.subjects(user.userId);
  }

  @Post('subjects')
  @ApiZodBody(createSubjectSchema)
  createSubject(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createSubjectSchema)) body: CreateSubject) {
    return this.study.createSubject(user.userId, body);
  }

  @Patch('subjects/:id')
  @ApiZodBody(updateSubjectSchema)
  updateSubject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateSubjectSchema)) body: UpdateSubject,
  ) {
    return this.study.updateSubject(user.userId, id, body);
  }

  @Delete('subjects/:id')
  @HttpCode(204)
  async removeSubject(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.study.removeSubject(user.userId, id);
  }

  @Get('sessions')
  @ApiZodQuery(sessionQuerySchema)
  sessions(@CurrentUser() user: AuthenticatedUser, @Query(new ZodValidationPipe(sessionQuerySchema)) q: z.infer<typeof sessionQuerySchema>) {
    return this.study.sessions(user.userId, q);
  }

  @Post('sessions')
  @ApiOperation({ summary: 'Log or plan a session; completed revisions need a 0–5 recall rating' })
  @ApiZodBody(createStudySessionSchema)
  createSession(@CurrentUser() user: AuthenticatedUser, @Body(new ZodValidationPipe(createStudySessionSchema)) body: CreateSession) {
    return this.study.createSession(user.userId, body);
  }

  @Post('sessions/:id/complete')
  @ApiZodBody(completeStudySessionSchema)
  complete(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(completeStudySessionSchema)) body: CompleteStudySessionInput,
  ) {
    return this.study.completeSession(user.userId, id, body);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  async removeSession(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.study.removeSession(user.userId, id);
  }

  @Get('reviews/due')
  @ApiOperation({ summary: 'Topics due for review today (SM-2)' })
  due(@CurrentUser() user: AuthenticatedUser) {
    return this.study.due(user.userId);
  }
}

@Module({ controllers: [StudyController], providers: [StudyService] })
export class StudyModule {}
