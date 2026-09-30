import { and, asc, desc, eq, isNull } from 'drizzle-orm';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { quizAttempts, quizQuestions, quizzes } from '@/server/db/schema';
import { notFound, route } from '@/server/http';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const db = await getDb();

    const quiz = await db.query.quizzes.findFirst({
      where: and(eq(quizzes.id, id), eq(quizzes.userId, user.id), isNull(quizzes.deletedAt)),
    });
    if (!quiz) throw notFound('Quiz not found.');

    const questions = await db
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quiz.id))
      .orderBy(asc(quizQuestions.ordinal));

    const attempts = await db
      .select()
      .from(quizAttempts)
      .where(eq(quizAttempts.quizId, quiz.id))
      .orderBy(desc(quizAttempts.createdAt))
      .limit(10);

    return { quiz, questions, attempts };
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const db = await getDb();
    const quiz = await db.query.quizzes.findFirst({
      where: and(eq(quizzes.id, id), eq(quizzes.userId, user.id)),
    });
    if (!quiz) throw notFound('Quiz not found.');
    await db.update(quizzes).set({ deletedAt: new Date() }).where(eq(quizzes.id, quiz.id));
    return { ok: true };
  });
}
