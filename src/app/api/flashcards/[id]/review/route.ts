import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { flashcards } from '@/server/db/schema';
import { notFound, parseBody, route } from '@/server/http';
import { scheduler, type ReviewGrade } from '@/services/study/srs';

const schema = z.object({ grade: z.number().int().min(0).max(5) });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const { grade } = await parseBody(request, schema);
    const db = await getDb();

    const card = await db.query.flashcards.findFirst({
      where: and(
        eq(flashcards.id, id),
        eq(flashcards.userId, user.id),
        isNull(flashcards.deletedAt),
      ),
    });
    if (!card) throw notFound('Card not found.');

    const next = scheduler().schedule(
      {
        repetitions: card.repetitions,
        easeFactor: card.easeFactor,
        intervalDays: card.intervalDays,
        dueAt: card.dueAt,
        lastReviewedAt: card.lastReviewedAt,
      },
      grade as ReviewGrade,
    );

    const [updated] = await db
      .update(flashcards)
      .set({
        repetitions: next.repetitions,
        easeFactor: next.easeFactor,
        intervalDays: next.intervalDays,
        dueAt: next.dueAt,
        lastReviewedAt: next.lastReviewedAt,
        updatedAt: new Date(),
      })
      .where(eq(flashcards.id, card.id))
      .returning();

    return { card: updated, nextDueAt: next.dueAt };
  });
}
