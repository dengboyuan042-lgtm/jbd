import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import {
  documentChunks,
  documents,
  files,
  notes,
  recordings,
  sources,
  transcriptSegments,
  transcripts,
} from '@/server/db/schema';
import { notFound, parseBody, route } from '@/server/http';
import { storage } from '@/services/storage';

async function load(userId: string, id: string) {
  const db = await getDb();
  const source = await db.query.sources.findFirst({
    where: and(eq(sources.id, id), eq(sources.userId, userId), isNull(sources.deletedAt)),
  });
  if (!source) throw notFound('Source not found.');
  return { db, source };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const { db, source } = await load(user.id, id);

    const document = await db.query.documents.findFirst({
      where: and(eq(documents.sourceId, source.id), eq(documents.userId, user.id)),
    });

    const [{ chunkCount }] = await db
      .select({ chunkCount: sql<number>`count(*)::int` })
      .from(documentChunks)
      .where(eq(documentChunks.sourceId, source.id));

    let file = null;
    let fileUrl: string | null = null;
    let recording = null;
    let transcript = null;
    let note = null;

    if (source.kind === 'file' && source.refId) {
      file = await db.query.files.findFirst({
        where: and(eq(files.id, source.refId), eq(files.userId, user.id)),
      });
      if (file) fileUrl = await storage().url(file.storageKey);
    }

    if (source.kind === 'recording' && source.refId) {
      recording = await db.query.recordings.findFirst({
        where: and(eq(recordings.id, source.refId), eq(recordings.userId, user.id)),
      });
      if (recording?.storageKey) fileUrl = await storage().url(recording.storageKey);
      const t = await db.query.transcripts.findFirst({
        where: and(
          eq(transcripts.recordingId, source.refId),
          eq(transcripts.userId, user.id),
        ),
      });
      if (t) {
        const segments = await db
          .select()
          .from(transcriptSegments)
          .where(eq(transcriptSegments.transcriptId, t.id))
          .orderBy(transcriptSegments.ordinal);
        transcript = { ...t, segments };
      }
    }

    if (source.kind === 'note' && source.refId) {
      note = await db.query.notes.findFirst({
        where: and(eq(notes.id, source.refId), eq(notes.userId, user.id)),
      });
    }

    return {
      source,
      document: document ?? null,
      chunkCount: Number(chunkCount),
      file: file ?? null,
      fileUrl,
      recording: recording ?? null,
      transcript,
      note: note ?? null,
    };
  });
}

const patchSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  summary: z.string().nullish(),
  projectId: z.string().nullish(),
  tags: z.array(z.string()).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const { db, source } = await load(user.id, id);
    const patch = await parseBody(request, patchSchema);

    const [updated] = await db
      .update(sources)
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.summary !== undefined ? { summary: patch.summary } : {}),
        ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        updatedAt: new Date(),
      })
      .where(eq(sources.id, source.id))
      .returning();

    if (patch.projectId !== undefined) {
      await db
        .update(documentChunks)
        .set({ projectId: patch.projectId ?? null })
        .where(eq(documentChunks.sourceId, source.id));
    }

    return { source: updated };
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const { db, source } = await load(user.id, id);
    const now = new Date();

    await db.update(sources).set({ deletedAt: now }).where(eq(sources.id, source.id));
    if (source.kind === 'file' && source.refId) {
      await db.update(files).set({ deletedAt: now }).where(eq(files.id, source.refId));
    }
    if (source.kind === 'note' && source.refId) {
      await db.update(notes).set({ deletedAt: now }).where(eq(notes.id, source.refId));
    }
    if (source.kind === 'recording' && source.refId) {
      await db
        .update(recordings)
        .set({ deletedAt: now })
        .where(eq(recordings.id, source.refId));
    }
    return { ok: true };
  });
}
