import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { notes, sources } from '@/server/db/schema';
import { notFound, parseBody, route } from '@/server/http';
import { indexNote } from '@/services/knowledge/ingest';

async function load(userId: string, id: string) {
  const db = await getDb();
  const note = await db.query.notes.findFirst({
    where: and(eq(notes.id, id), eq(notes.userId, userId), isNull(notes.deletedAt)),
  });
  if (!note) throw notFound('Note not found.');
  return { db, note };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const { note } = await load(user.id, id);
    return { note };
  });
}

const patchSchema = z.object({
  title: z.string().max(300).optional(),
  content: z.string().optional(),
  projectId: z.string().nullish(),
  tags: z.array(z.string()).optional(),
  pinned: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const { db, note } = await load(user.id, id);
    const patch = await parseBody(request, patchSchema);

    const [updated] = await db
      .update(notes)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(notes.id, note.id))
      .returning();

    // Re-index only when the searchable payload actually changed.
    if (patch.content !== undefined || patch.title !== undefined || patch.projectId !== undefined) {
      const sourceId = await indexNote({
        userId: user.id,
        noteId: updated.id,
        title: updated.title,
        content: updated.content,
        projectId: updated.projectId,
      });
      if (!updated.sourceId) {
        await db.update(notes).set({ sourceId }).where(eq(notes.id, updated.id));
      }
    }

    return { note: updated };
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const { db, note } = await load(user.id, id);
    const now = new Date();
    await db.update(notes).set({ deletedAt: now }).where(eq(notes.id, note.id));
    if (note.sourceId) {
      await db.update(sources).set({ deletedAt: now }).where(eq(sources.id, note.sourceId));
    }
    return { ok: true };
  });
}
