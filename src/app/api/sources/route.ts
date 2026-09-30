import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { files, sourceKinds, sources, type SourceKind } from '@/server/db/schema';
import { parseQuery, route } from '@/server/http';

const querySchema = z.object({
  projectId: z.string().optional(),
  kind: z
    .union([z.enum(sourceKinds), z.array(z.enum(sourceKinds))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  q: z.string().optional(),
  tag: z.string().optional(),
  sort: z.enum(['recent', 'created', 'title', 'size']).default('recent'),
  limit: z.coerce.number().int().min(1).max(200).default(60),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function GET(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const params = parseQuery(request, querySchema);
    const db = await getDb();

    const conditions = [eq(sources.userId, user.id), isNull(sources.deletedAt)];
    if (params.projectId) conditions.push(eq(sources.projectId, params.projectId));
    if (params.kind?.length)
      conditions.push(inArray(sources.kind, params.kind as SourceKind[]));
    if (params.q) {
      conditions.push(sql`lower(${sources.title}) LIKE ${`%${params.q.toLowerCase()}%`}`);
    }
    if (params.tag) {
      conditions.push(sql`${sources.tags}::jsonb @> ${JSON.stringify([params.tag])}::jsonb`);
    }

    const orderBy =
      params.sort === 'title'
        ? sql`lower(${sources.title}) ASC`
        : params.sort === 'created'
          ? desc(sources.createdAt)
          : desc(sources.updatedAt);

    const rows = await db
      .select()
      .from(sources)
      .where(and(...conditions))
      .orderBy(orderBy)
      .limit(params.limit)
      .offset(params.offset);

    const fileIds = rows.map((r) => r.refId).filter(Boolean) as string[];
    const fileRows = fileIds.length
      ? await db.select().from(files).where(inArray(files.id, fileIds))
      : [];
    const fileById = new Map(fileRows.map((f) => [f.id, f]));

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(sources)
      .where(and(...conditions));

    return {
      sources: rows.map((row) => ({
        ...row,
        file: row.refId ? (fileById.get(row.refId) ?? null) : null,
      })),
      total: Number(count),
    };
  });
}
