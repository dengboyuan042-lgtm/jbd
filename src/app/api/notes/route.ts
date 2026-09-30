import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { ids } from '@/lib/id';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { notes } from '@/server/db/schema';
import { parseBody, parseQuery, route } from '@/server/http';
import { indexNote, logActivity } from '@/services/knowledge/ingest';

const querySchema = z.object({
  projectId: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export async function GET(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const params = parseQuery(request, querySchema);
    const db = await getDb();

    const conditions = [eq(notes.userId, user.id), isNull(notes.deletedAt)];
    if (params.projectId) conditions.push(eq(notes.projectId, params.projectId));
    if (params.q)
      conditions.push(sql`lower(${notes.title}) LIKE ${`%${params.q.toLowerCase()}%`}`);

    const rows = await db
      .select()
      .from(notes)
      .where(and(...conditions))
      .orderBy(desc(notes.pinned), desc(notes.updatedAt))
      .limit(params.limit);

    return { notes: rows };
  });
}

const createSchema = z.object({
  title: z.string().max(300).default('Untitled'),
  content: z.string().default(''),
  projectId: z.string().nullish(),
  tags: z.array(z.string()).default([]),
  origin: z.record(z.unknown()).default({}),
});

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const body = await parseBody(request, createSchema);
    const db = await getDb();

    const noteId = ids.note();
    const [note] = await db
      .insert(notes)
      .values({
        id: noteId,
        userId: user.id,
        projectId: body.projectId ?? null,
        title: body.title,
        content: body.content,
        tags: body.tags,
        origin: body.origin,
      })
      .returning();

    const sourceId = await indexNote({
      userId: user.id,
      noteId,
      title: note.title,
      content: note.content,
      projectId: note.projectId,
    });
    await db.update(notes).set({ sourceId }).where(eq(notes.id, noteId));
    await logActivity(user.id, {
      kind: 'note.create',
      title: note.title,
      href: `/notes/${noteId}`,
      projectId: note.projectId,
    });

    return { note: { ...note, sourceId } };
  });
}
