import { and, eq, isNull } from 'drizzle-orm';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { files, recordings } from '@/server/db/schema';
import { badRequest, notFound, route } from '@/server/http';
import { ingestTranscript } from '@/services/knowledge/ingest';
import { speech, SpeechUnavailableError } from '@/services/speech';
import { storage } from '@/services/storage';

/**
 * Server-side transcription of a stored recording or uploaded media file.
 * Fails loudly (501) when no ASR provider is configured rather than inventing
 * a transcript — the client surfaces that as an actionable message.
 */
export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const body = (await request.json()) as {
      recordingId?: string;
      fileId?: string;
      language?: string;
    };
    const db = await getDb();
    const provider = speech();

    if (!provider.hosted) {
      throw new SpeechUnavailableError(
        'No transcription provider is configured. Set SPEECH_DRIVER (openai-whisper or deepgram) with its API key, or record in the browser to use on-device recognition.',
      );
    }

    let audio: Buffer;
    let mimeType: string;
    let recordingId = body.recordingId;

    if (body.recordingId) {
      const recording = await db.query.recordings.findFirst({
        where: and(
          eq(recordings.id, body.recordingId),
          eq(recordings.userId, user.id),
          isNull(recordings.deletedAt),
        ),
      });
      if (!recording?.storageKey) throw notFound('Recording has no stored audio.');
      audio = await storage().get(recording.storageKey);
      mimeType = recording.mimeType ?? 'audio/webm';
    } else if (body.fileId) {
      const file = await db.query.files.findFirst({
        where: and(
          eq(files.id, body.fileId),
          eq(files.userId, user.id),
          isNull(files.deletedAt),
        ),
      });
      if (!file) throw notFound('File not found.');
      audio = await storage().get(file.storageKey);
      mimeType = file.mimeType;

      const { ids } = await import('@/lib/id');
      const [created] = await db
        .insert(recordings)
        .values({
          id: ids.recording(),
          userId: user.id,
          projectId: file.projectId,
          title: file.name.replace(/\.[^.]+$/, ''),
          storageKey: file.storageKey,
          mimeType: file.mimeType,
          status: 'processing',
        })
        .returning();
      recordingId = created.id;
    } else {
      throw badRequest('Provide either recordingId or fileId.');
    }

    const result = await provider.transcribe(audio, mimeType, {
      language: body.language,
      diarize: true,
      punctuate: true,
    });

    return ingestTranscript({
      userId: user.id,
      recordingId: recordingId!,
      transcript: {
        provider: result.provider,
        language: result.language,
        durationSec: result.duration,
        segments: result.segments.map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text,
          speaker: s.speaker,
          confidence: s.confidence,
        })),
      },
    });
  });
}

export const runtime = 'nodejs';
export const maxDuration = 600;
