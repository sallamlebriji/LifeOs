import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { DEFAULT_TIMEZONE, type Page } from '@lifeos/shared';
import { type PrismaService } from '../prisma/prisma.service';

export const categorySelect = { select: { id: true, name: true, color: true } } as const;

/** Date-only columns hold UTC midnight of the local calendar date. */
export function toDateOnly(key: string | null | undefined): Date | null | undefined {
  if (key === undefined) return undefined;
  return key === null ? null : new Date(`${key}T00:00:00Z`);
}

export function fromDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

export function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/** Cursor page from a `take: limit + 1` query. */
export function toPage<T extends { id: string }, R>(rows: T[], limit: number, map: (row: T) => R): Page<R> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items: items.map(map), nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

export function cursorArgs(cursor: string | undefined, limit: number) {
  return { take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) };
}

export async function userTimezone(prisma: PrismaService, userId: string) {
  const prefs = await prisma.userPreferences.findUnique({
    where: { userId },
    select: { timezone: true, weekStartsOn: true },
  });
  return { timezone: prefs?.timezone ?? DEFAULT_TIMEZONE, weekStartsOn: prefs?.weekStartsOn ?? 1 };
}

/**
 * Referenced rows (project, goal, category, parent…) must belong to the caller.
 * A foreign id is reported exactly like a missing one, so ids can't be probed.
 */
export async function assertOwnedRefs(
  prisma: PrismaService,
  userId: string,
  refs: {
    projectId?: string | null;
    goalId?: string | null;
    categoryId?: string | null;
    taskId?: string | null;
  },
) {
  const checks: Array<Promise<void>> = [];
  const check = (label: string, found: Promise<unknown>) =>
    checks.push(
      found.then((row) => {
        if (!row) throw new BadRequestException({ statusCode: 400, error: 'Bad Request', message: `${label} not found`, issues: { [`${label.toLowerCase()}Id`]: [`${label} not found`] } });
      }),
    );
  if (refs.projectId) check('Project', prisma.project.findFirst({ where: { id: refs.projectId, userId }, select: { id: true } }));
  if (refs.goalId) check('Goal', prisma.goal.findFirst({ where: { id: refs.goalId, userId }, select: { id: true } }));
  if (refs.categoryId) check('Category', prisma.category.findFirst({ where: { id: refs.categoryId, userId }, select: { id: true } }));
  if (refs.taskId) check('Task', prisma.task.findFirst({ where: { id: refs.taskId, userId }, select: { id: true } }));
  await Promise.all(checks);
}

/**
 * Optimistic-concurrency update outcome: 0 rows means either the row doesn't
 * exist for this user (404) or its version moved on (409).
 */
export async function versionedMiss(exists: Promise<unknown>, what: string): Promise<never> {
  if (!(await exists)) throw new NotFoundException(`${what} not found`);
  throw new ConflictException({
    statusCode: 409,
    error: 'Conflict',
    message: `This ${what.toLowerCase()} was changed elsewhere. Reload and try again.`,
  });
}
