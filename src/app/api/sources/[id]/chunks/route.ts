import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { documentChunks, sources } from '@/server/db/schema';
import { notFound, parseQuery, route } from '@/server/http';

const querySchema = z.object({
  page: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const params = parseQuery(request, querySchema);
    const db = await getDb();

    const source = await db.query.sources.findFirst({
      where: and(eq(sources.id, id), eq(sources.userId, user.id), isNull(sources.deletedAt)),
    });
    if (!source) throw notFound('Source not found.');

    const conditions = [
      eq(documentChunks.sourceId, id),
      eq(documentChunks.userId, user.id),
    ];
    if (params.page != null) conditions.push(eq(documentChunks.page, params.page));

    const rows = await db
      .select()
      .from(documentChunks)
      .where(and(...conditions))
      .orderBy(asc(documentChunks.ordinal))
      .limit(params.limit)
      .offset(params.offset);

    return { chunks: rows };
  });
}
