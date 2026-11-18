/** Pure task rules, unit-tested without a database. */

/**
 * Would adding "taskId depends on dependsOnId" create a cycle?
 * `edges` are existing [taskId, dependsOnId] pairs. A cycle exists if
 * dependsOnId already (transitively) depends on taskId.
 */
export function wouldCreateCycle(
  edges: ReadonlyArray<readonly [string, string]>,
  taskId: string,
  dependsOnId: string,
): boolean {
  if (taskId === dependsOnId) return true;
  const next = new Map<string, string[]>();
  for (const [from, to] of edges) (next.get(from) ?? next.set(from, []).get(from)!).push(to);
  const seen = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...(next.get(current) ?? []));
  }
  return false;
}

/** Shift an instant by whole days (keeps time-of-day in UTC terms). */
export function shiftByDays(value: Date | null, fromKey: string, toKey: string): Date | null {
  if (!value) return null;
  const delta = Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`);
  return new Date(value.getTime() + delta);
}
