import { describe, expect, it } from 'vitest';
import { shiftByDays, wouldCreateCycle } from './task-rules';

describe('wouldCreateCycle', () => {
  const edges = [
    ['b', 'a'], // b depends on a
    ['c', 'b'], // c depends on b
  ] as const;

  it('rejects self-dependency', () => {
    expect(wouldCreateCycle([], 'a', 'a')).toBe(true);
  });
  it('detects direct and transitive cycles', () => {
    expect(wouldCreateCycle(edges, 'a', 'b')).toBe(true);
    expect(wouldCreateCycle(edges, 'a', 'c')).toBe(true);
  });
  it('allows acyclic additions', () => {
    expect(wouldCreateCycle(edges, 'c', 'a')).toBe(false);
    expect(wouldCreateCycle(edges, 'd', 'c')).toBe(false);
  });
});

describe('shiftByDays', () => {
  it('moves a due date with the recurrence', () => {
    expect(shiftByDays(new Date('2026-11-18T16:00:00Z'), '2026-11-18', '2026-11-25')?.toISOString()).toBe(
      '2026-11-25T16:00:00.000Z',
    );
    expect(shiftByDays(null, '2026-11-18', '2026-11-25')).toBeNull();
  });
});
