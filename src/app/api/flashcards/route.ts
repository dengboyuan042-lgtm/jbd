import { and, asc, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { ids } from '@/lib/id';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { flashcardDecks, flashcards } from '@/server/db/schema';
import { parseBody, parseQuery, route } from '@/server/http';

const querySchema = z.object({
  deckId: z.string().optional(),
  projectId: z.string().optional(),
  due: z.enum(['0', '1']).default('0'),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function GET(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const params = parseQuery(request, querySchema);
    const db = await getDb();

    const conditions = [eq(flashcards.userId, user.id), isNull(flashcards.deletedAt)];
    if (params.deckId) conditions.push(eq(flashcards.deckId, params.deckId));
    if (params.projectId) conditions.push(eq(flashcards.projectId, params.projectId));
    if (params.due === '1') {
      conditions.push(
        or(isNull(flashcards.dueAt), lte(flashcards.dueAt, new Date()))!,
      );
    }

    const cards = await db
      .select()
      .from(flashcards)
      .where(and(...conditions))
      .orderBy(asc(flashcards.dueAt), asc(flashcards.createdAt))
      .limit(params.limit);

    const deckConditions = [
      eq(flashcardDecks.userId, user.id),
      isNull(flashcardDecks.deletedAt),
    ];
    if (params.projectId) deckConditions.push(eq(flashcardDecks.projectId, params.projectId));

    const decks = await db
      .select()
      .from(flashcardDecks)
      .where(and(...deckConditions))
      .orderBy(desc(flashcardDecks.updatedAt));

    const counts = await db
      .select({
        deckId: flashcards.deckId,
        total: sql<number>`count(*)::int`,
        due: sql<number>`count(*) filter (where ${flashcards.dueAt} is null or ${flashcards.dueAt} <= now())::int`,
      })
      .from(flashcards)
      .where(and(eq(flashcards.userId, user.id), isNull(flashcards.deletedAt)))
      .groupBy(flashcards.deckId);
    const countByDeck = new Map(counts.map((c) => [c.deckId, c]));

    return {
      cards,
      decks: decks.map((d) => ({
        ...d,
        total: Number(countByDeck.get(d.id)?.total ?? 0),
        due: Number(countByDeck.get(d.id)?.due ?? 0),
      })),
    };
  });
}

const createSchema = z.object({
  deckId: z.string().nullish(),
  projectId: z.string().nullish(),
  question: z.string().min(1),
  answer: z.string().min(1),
  hint: z.string().nullish(),
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  tags: z.array(z.string()).default([]),
});

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const body = await parseBody(request, createSchema);
    const db = await getDb();
    const [card] = await db
      .insert(flashcards)
      .values({
        id: ids.flashcard(),
        userId: user.id,
        deckId: body.deckId ?? null,
        projectId: body.projectId ?? null,
        question: body.question,
        answer: body.answer,
        hint: body.hint ?? null,
        difficulty: body.difficulty,
        tags: body.tags,
        dueAt: new Date(),
      })
      .returning();
    return { card };
  });
}
