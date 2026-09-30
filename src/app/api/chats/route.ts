import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { ids } from '@/lib/id';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { chats } from '@/server/db/schema';
import { parseBody, parseQuery, route } from '@/server/http';

const querySchema = z.object({
  projectId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const params = parseQuery(request, querySchema);
    const db = await getDb();
    const conditions = [eq(chats.userId, user.id), isNull(chats.deletedAt)];
    if (params.projectId) conditions.push(eq(chats.projectId, params.projectId));
    const rows = await db
      .select()
      .from(chats)
      .where(and(...conditions))
      .orderBy(desc(chats.updatedAt))
      .limit(params.limit);
    return { chats: rows };
  });
}

const createSchema = z.object({
  title: z.string().max(200).optional(),
  projectId: z.string().nullish(),
  contextSourceIds: z.array(z.string()).default([]),
  mode: z.enum(['chat', 'agent']).default('chat'),
});

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const body = await parseBody(request, createSchema);
    const db = await getDb();
    const [chat] = await db
      .insert(chats)
      .values({
        id: ids.chat(),
        userId: user.id,
        projectId: body.projectId ?? null,
        title: body.title ?? 'New chat',
        contextSourceIds: body.contextSourceIds,
        mode: body.mode,
      })
      .returning();
    return { chat };
  });
}
