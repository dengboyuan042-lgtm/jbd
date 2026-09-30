import { and, eq, isNull } from 'drizzle-orm';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { recordings } from '@/server/db/schema';
import { badRequest, notFound, route } from '@/server/http';
import { storage, storageKey } from '@/services/storage';

/** Store the captured audio blob for a recording so it can be replayed. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const db = await getDb();

    const recording = await db.query.recordings.findFirst({
      where: and(
        eq(recordings.id, id),
        eq(recordings.userId, user.id),
        isNull(recordings.deletedAt),
      ),
    });
    if (!recording) throw notFound('Recording not found.');

    const form = await request.formData();
    const blob = form.get('audio');
    if (!(blob instanceof File)) throw badRequest('No audio blob was provided.');

    const durationSec = Number(form.get('durationSec') ?? 0);
    const waveformRaw = form.get('waveform');
    let waveform: number[] = [];
    if (typeof waveformRaw === 'string') {
      try {
        waveform = JSON.parse(waveformRaw);
      } catch {
        waveform = [];
      }
    }

    const mimeType = blob.type || 'audio/webm';
    const extension = mimeType.includes('mp4')
      ? 'm4a'
      : mimeType.includes('ogg')
        ? 'ogg'
        : mimeType.includes('wav')
          ? 'wav'
          : 'webm';
    const key = storageKey(user.id, 'recordings', recording.id, `audio.${extension}`);

    await storage().put({
      key,
      body: Buffer.from(await blob.arrayBuffer()),
      contentType: mimeType,
    });

    const [updated] = await db
      .update(recordings)
      .set({
        storageKey: key,
        mimeType,
        durationSec: durationSec || recording.durationSec,
        waveform: waveform.length ? waveform : recording.waveform,
        updatedAt: new Date(),
      })
      .where(eq(recordings.id, recording.id))
      .returning();

    return { recording: updated, url: await storage().url(key) };
  });
}

export const runtime = 'nodejs';
export const maxDuration = 300;
