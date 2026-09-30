import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { ids } from '@/lib/id';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { quizAttempts, quizQuestions, quizzes } from '@/server/db/schema';
import { notFound, parseBody, route } from '@/server/http';
import { contentWords } from '@/services/ai/nlp';

const schema = z.object({
  responses: z.array(z.object({ questionId: z.string(), answer: z.string() })),
});

/** Grade an attempt server-side — answers are never sent to the client. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const body = await parseBody(request, schema);
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
    const byId = new Map(questions.map((q) => [q.id, q]));

    const graded = body.responses.map((response) => {
      const question = byId.get(response.questionId);
      if (!question) return { ...response, correct: false };
      return { ...response, correct: isCorrect(question.type, response.answer, question.answer) };
    });

    const correctCount = graded.filter((g) => g.correct).length;
    const score = questions.length ? (correctCount / questions.length) * 100 : 0;

    const missedTopics = graded
      .filter((g) => !g.correct)
      .map((g) => byId.get(g.questionId)?.topic)
      .filter((t): t is string => Boolean(t));
    const weakTopics = [...new Set(missedTopics)];

    const [attempt] = await db
      .insert(quizAttempts)
      .values({
        id: ids.attempt(),
        userId: user.id,
        quizId: quiz.id,
        score,
        total: questions.length,
        responses: graded,
        weakTopics,
        completedAt: new Date(),
      })
      .returning();

    return {
      attempt,
      review: questions.map((question) => {
        const response = graded.find((g) => g.questionId === question.id);
        return {
          questionId: question.id,
          prompt: question.prompt,
          type: question.type,
          yourAnswer: response?.answer ?? '',
          correctAnswer: question.answer,
          correct: response?.correct ?? false,
          explanation: question.explanation,
          topic: question.topic,
          citation: question.citation,
        };
      }),
    };
  });
}

function isCorrect(type: string, given: string, expected: string): boolean {
  const normalise = (s: string) => s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '');
  const a = normalise(given);
  const b = normalise(expected);
  if (!a) return false;
  if (a === b) return true;

  if (type === 'multiple_choice' || type === 'true_false') return false;
  if (type === 'fill_blank') return a === b || b.startsWith(a) || a.startsWith(b);

  // Short answer: token-overlap threshold, since exact match is too strict.
  const expectedTokens = new Set(contentWords(expected));
  if (!expectedTokens.size) return a === b;
  const givenTokens = new Set(contentWords(given));
  let hits = 0;
  for (const t of expectedTokens) if (givenTokens.has(t)) hits++;
  return hits / expectedTokens.size >= 0.6;
}
