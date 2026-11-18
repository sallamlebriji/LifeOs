/**
 * SM-2 spaced repetition (SuperMemo 2). Quality is the self-rated recall 0–5:
 * below 3 restarts the sequence; the ease factor never drops below 1.3.
 */
export interface ReviewState {
  easeFactor: number;
  intervalDays: number;
  /** Consecutive successful reviews. */
  repetitions: number;
}

export const INITIAL_REVIEW_STATE: ReviewState = { easeFactor: 2.5, intervalDays: 0, repetitions: 0 };

export function nextReview(state: ReviewState, quality: number): ReviewState {
  const q = Math.max(0, Math.min(5, Math.round(quality)));
  const ease = Math.max(1.3, Math.round((state.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))) * 100) / 100);
  if (q < 3) return { easeFactor: ease, intervalDays: 1, repetitions: 0 };
  const repetitions = state.repetitions + 1;
  const intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(state.intervalDays * ease);
  return { easeFactor: ease, intervalDays, repetitions };
}

/**
 * Rebuilds the state for a topic from its completed revisions (oldest first),
 * so nothing but `quality` needs to be trusted from the client.
 */
export function replayReviews(qualities: readonly number[]): ReviewState {
  return qualities.reduce<ReviewState>((s, q) => nextReview(s, q), INITIAL_REVIEW_STATE);
}
