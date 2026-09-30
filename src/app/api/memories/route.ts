import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { ids } from '@/lib/id';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { memories } from '@/server/db/schema';
import { parseBody, parseQuery, route } from '@/server/http';

const querySchema = z.object({
  scope: z.enum(['user', 'project']).optional(),
  projectId: z.string().optional(),
});

export async function GET(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const params = parseQuery(request, querySchema);
    const db = await getDb();
    const conditions = [eq(memories.userId, user.id), isNull(memories.deletedAt)];
    if (params.scope) conditions.push(eq(memories.scope, params.scope));
    if (params.projectId) conditions.push(eq(memories.projectId, params.projectId));
    const rows = await db
      .select()
      .from(memories)
      .where(and(...conditions))
      .orderBy(desc(memories.pinned), desc(memories.updatedAt));
    return { memories: rows };
  });
}

const createSchema = z.object({
  scope: z.enum(['user', 'project']).default('user'),
  projectId: z.string().nullish(),
  kind: z
    .enum(['preference', 'fact', 'goal', 'person', 'concept', 'decision'])
    .default('fact'),
  key: z.string().min(1).max(160),
  value: z.string().min(1).max(4000),
  pinned: z.boolean().default(false),
});

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const body = await parseBody(request, createSchema);
    const db = await getDb();
    const [memory] = await db
      .insert(memories)
      .values({
        id: ids.memory(),
        userId: user.id,
        scope: body.scope,
        projectId: body.scope === 'project' ? (body.projectId ?? null) : null,
        kind: body.kind,
        key: body.key,
        value: body.value,
        pinned: body.pinned,
        origin: 'manual',
      })
      .returning();
    return { memory };
  });
}
