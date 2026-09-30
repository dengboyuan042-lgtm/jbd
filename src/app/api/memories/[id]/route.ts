import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { memories } from '@/server/db/schema';
import { notFound, parseBody, route } from '@/server/http';

const patchSchema = z.object({
  key: z.string().min(1).max(160).optional(),
  value: z.string().min(1).max(4000).optional(),
  pinned: z.boolean().optional(),
  kind: z
    .enum(['preference', 'fact', 'goal', 'person', 'concept', 'decision'])
    .optional(),
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
    const memory = await db.query.memories.findFirst({
      where: and(eq(memories.id, id), eq(memories.userId, user.id), isNull(memories.deletedAt)),
    });
    if (!memory) throw notFound('Memory not found.');
    const [updated] = await db
      .update(memories)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(memories.id, memory.id))
      .returning();
    return { memory: updated };
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
    const memory = await db.query.memories.findFirst({
      where: and(eq(memories.id, id), eq(memories.userId, user.id)),
    });
    if (!memory) throw notFound('Memory not found.');
    await db.update(memories).set({ deletedAt: new Date() }).where(eq(memories.id, memory.id));
    return { ok: true };
  });
}
