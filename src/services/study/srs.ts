/**
 * SM-2 spaced repetition.
 *
 * Kept as a pure function with an explicit state shape so an alternative
 * scheduler (FSRS, Leitner) can be swapped in without touching the API layer
 * or the review UI.
 */

export type ReviewGrade = 0 | 1 | 2 | 3 | 4 | 5;

export type SrsState = {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  dueAt: Date | null;
  lastReviewedAt: Date | null;
};

export type Scheduler = {
  id: string;
  schedule(state: SrsState, grade: ReviewGrade, now?: Date): SrsState;
};

export const sm2: Scheduler = {
  id: 'sm2',
  schedule(state, grade, now = new Date()) {
    const quality = Math.min(5, Math.max(0, grade));
    let { repetitions, easeFactor, intervalDays } = state;

    if (quality < 3) {
      repetitions = 0;
      intervalDays = quality === 0 ? 0 : 1;
    } else {
      repetitions += 1;
      intervalDays =
        repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.round(intervalDays * easeFactor);
    }

    easeFactor = Math.max(
      1.3,
      easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
    );

    const dueAt = new Date(now);
    if (intervalDays === 0) dueAt.setMinutes(dueAt.getMinutes() + 10);
    else dueAt.setDate(dueAt.getDate() + intervalDays);

    return {
      repetitions,
      easeFactor: Number(easeFactor.toFixed(3)),
      intervalDays,
      dueAt,
      lastReviewedAt: now,
    };
  },
};

/** UI grades map onto SM-2 quality scores. */
export const GRADE_LABELS: { grade: ReviewGrade; label: string; hint: string }[] = [
  { grade: 0, label: 'Again', hint: 'Show it again shortly' },
  { grade: 3, label: 'Hard', hint: 'Correct, with effort' },
  { grade: 4, label: 'Good', hint: 'Correct' },
  { grade: 5, label: 'Easy', hint: 'Instant recall' },
];

export function scheduler(): Scheduler {
  return sm2;
}
