import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { quizAttempts, quizQuestions, quizzes } from '@/server/db/schema';
import { parseQuery, route } from '@/server/http';

const querySchema = z.object({ projectId: z.string().optional() });

export async function GET(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const params = parseQuery(request, querySchema);
    const db = await getDb();

    const conditions = [eq(quizzes.userId, user.id), isNull(quizzes.deletedAt)];
    if (params.projectId) conditions.push(eq(quizzes.projectId, params.projectId));

    const rows = await db
      .select()
      .from(quizzes)
      .where(and(...conditions))
      .orderBy(desc(quizzes.updatedAt));

    const counts = await db
      .select({ quizId: quizQuestions.quizId, count: sql<number>`count(*)::int` })
      .from(quizQuestions)
      .where(eq(quizQuestions.userId, user.id))
      .groupBy(quizQuestions.quizId);
    const byQuiz = new Map(counts.map((c) => [c.quizId, Number(c.count)]));

    const attempts = await db
      .select({
        quizId: quizAttempts.quizId,
        best: sql<number>`max(${quizAttempts.score})`,
        attempts: sql<number>`count(*)::int`,
      })
      .from(quizAttempts)
      .where(eq(quizAttempts.userId, user.id))
      .groupBy(quizAttempts.quizId);
    const attemptByQuiz = new Map(attempts.map((a) => [a.quizId, a]));

    return {
      quizzes: rows.map((q) => ({
        ...q,
        questionCount: byQuiz.get(q.id) ?? 0,
        bestScore: attemptByQuiz.get(q.id)?.best ?? null,
        attemptCount: Number(attemptByQuiz.get(q.id)?.attempts ?? 0),
      })),
    };
  });
}
