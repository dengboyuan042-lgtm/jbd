import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { ids } from '@/lib/id';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { tasks } from '@/server/db/schema';
import { parseBody, parseQuery, route } from '@/server/http';

const querySchema = z.object({
  projectId: z.string().optional(),
  status: z.enum(['open', 'doing', 'done']).optional(),
});

export async function GET(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const params = parseQuery(request, querySchema);
    const db = await getDb();
    const conditions = [eq(tasks.userId, user.id), isNull(tasks.deletedAt)];
    if (params.projectId) conditions.push(eq(tasks.projectId, params.projectId));
    if (params.status) conditions.push(eq(tasks.status, params.status));
    const rows = await db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(asc(tasks.status), asc(tasks.dueAt), desc(tasks.createdAt));
    return { tasks: rows };
  });
}

const createSchema = z.object({
  title: z.string().min(1).max(280),
  detail: z.string().nullish(),
  projectId: z.string().nullish(),
  sourceId: z.string().nullish(),
  dueAt: z.string().nullish(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
});

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const body = await parseBody(request, createSchema);
    const db = await getDb();
    const due = body.dueAt ? new Date(body.dueAt) : null;
    const [task] = await db
      .insert(tasks)
      .values({
        id: ids.task(),
        userId: user.id,
        projectId: body.projectId ?? null,
        sourceId: body.sourceId ?? null,
        title: body.title,
        detail: body.detail ?? null,
        priority: body.priority,
        dueAt: due && !Number.isNaN(due.getTime()) ? due : null,
      })
      .returning();
    return { task };
  });
}
