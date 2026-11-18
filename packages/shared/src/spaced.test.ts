import { describe, expect, it } from 'vitest';
import { INITIAL_REVIEW_STATE, nextReview, replayReviews } from './spaced';

describe('SM-2', () => {
  it('grows intervals 1 → 6 → interval × ease on good recall', () => {
    let s = nextReview(INITIAL_REVIEW_STATE, 4);
    expect(s).toEqual({ easeFactor: 2.5, intervalDays: 1, repetitions: 1 });
    s = nextReview(s, 4);
    expect(s.intervalDays).toBe(6);
    s = nextReview(s, 5);
    expect(s).toEqual({ easeFactor: 2.6, intervalDays: 16, repetitions: 3 });
  });

  it('restarts after a lapse and never lets ease fall below 1.3', () => {
    const s = replayReviews([5, 5, 5, 1]);
    expect(s.repetitions).toBe(0);
    expect(s.intervalDays).toBe(1);
    expect(replayReviews([0, 0, 0, 0, 0, 0, 0]).easeFactor).toBe(1.3);
  });
});
