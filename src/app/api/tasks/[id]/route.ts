import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { tasks } from '@/server/db/schema';
import { notFound, parseBody, route } from '@/server/http';

const patchSchema = z.object({
  title: z.string().min(1).max(280).optional(),
  detail: z.string().nullish(),
  status: z.enum(['open', 'doing', 'done']).optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  dueAt: z.string().nullish(),
  projectId: z.string().nullish(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const patch = await parseBody(request, patchSchema);
    const db = await getDb();

    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.userId, user.id), isNull(tasks.deletedAt)),
    });
    if (!task) throw notFound('Task not found.');

    const { dueAt, ...rest } = patch;
    const parsedDue = dueAt === undefined ? undefined : dueAt ? new Date(dueAt) : null;

    const [updated] = await db
      .update(tasks)
      .set({
        ...rest,
        ...(parsedDue !== undefined ? { dueAt: parsedDue } : {}),
        ...(patch.status === 'done' ? { completedAt: new Date() } : {}),
        ...(patch.status && patch.status !== 'done' ? { completedAt: null } : {}),
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id))
      .returning();

    return { task: updated };
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
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.id, id), eq(tasks.userId, user.id)),
    });
    if (!task) throw notFound('Task not found.');
    await db.update(tasks).set({ deletedAt: new Date() }).where(eq(tasks.id, task.id));
    return { ok: true };
  });
}
