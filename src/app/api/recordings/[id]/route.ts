import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import {
  recordings,
  sources,
  speakers,
  transcriptSegments,
  transcripts,
} from '@/server/db/schema';
import { notFound, parseBody, route } from '@/server/http';
import { storage } from '@/services/storage';

async function load(userId: string, id: string) {
  const db = await getDb();
  const recording = await db.query.recordings.findFirst({
    where: and(
      eq(recordings.id, id),
      eq(recordings.userId, userId),
      isNull(recordings.deletedAt),
    ),
  });
  if (!recording) throw notFound('Recording not found.');
  return { db, recording };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const { db, recording } = await load(user.id, id);

    const transcript = await db.query.transcripts.findFirst({
      where: and(
        eq(transcripts.recordingId, recording.id),
        eq(transcripts.userId, user.id),
      ),
    });

    const segments = transcript
      ? await db
          .select()
          .from(transcriptSegments)
          .where(eq(transcriptSegments.transcriptId, transcript.id))
          .orderBy(asc(transcriptSegments.ordinal))
      : [];

    const speakerRows = transcript
      ? await db.select().from(speakers).where(eq(speakers.transcriptId, transcript.id))
      : [];

    const audioUrl = recording.storageKey
      ? await storage().url(recording.storageKey)
      : null;

    return {
      recording,
      transcript: transcript ?? null,
      segments,
      speakers: speakerRows,
      audioUrl,
    };
  });
}

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  projectId: z.string().nullish(),
  status: z.enum(['recording', 'processing', 'ready', 'failed']).optional(),
  durationSec: z.number().optional(),
  waveform: z.array(z.number()).optional(),
  speakerNames: z.record(z.string()).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const { db, recording } = await load(user.id, id);
    const patch = await parseBody(request, patchSchema);

    const { speakerNames, ...rest } = patch;
    const [updated] = await db
      .update(recordings)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(recordings.id, recording.id))
      .returning();

    if (patch.title && recording.sourceId) {
      await db
        .update(sources)
        .set({ title: patch.title, updatedAt: new Date() })
        .where(eq(sources.id, recording.sourceId));
    }

    if (speakerNames) {
      for (const [speakerId, displayName] of Object.entries(speakerNames)) {
        await db
          .update(speakers)
          .set({ displayName })
          .where(and(eq(speakers.id, speakerId), eq(speakers.userId, user.id)));
      }
    }

    return { recording: updated };
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const { db, recording } = await load(user.id, id);
    const now = new Date();
    await db
      .update(recordings)
      .set({ deletedAt: now })
      .where(eq(recordings.id, recording.id));
    if (recording.sourceId) {
      await db.update(sources).set({ deletedAt: now }).where(eq(sources.id, recording.sourceId));
    }
    return { ok: true };
  });
}
