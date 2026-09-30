import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { parseBody, route } from '@/server/http';
import { ingestTranscript } from '@/services/knowledge/ingest';
import { LocalSpeechProvider, segmentize } from '@/services/speech';

const schema = z.object({
  provider: z.string().default('browser'),
  language: z.string().max(12).nullish(),
  durationSec: z.number().min(0).default(0),
  /** run turn-taking diarisation over segments that have no speaker */
  diarize: z.boolean().default(true),
  segments: z
    .array(
      z.object({
        start: z.number().min(0),
        end: z.number().min(0),
        text: z.string().min(1),
        speaker: z.string().optional(),
        confidence: z.number().optional(),
        language: z.string().optional(),
      }),
    )
    .min(1),
});

/** Persist a transcript produced live in the browser, then index it. */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const body = await parseBody(request, schema);

    let segments = body.segments.map((s, i) => ({
      ...s,
      ordinal: i,
      text: s.text,
      start: s.start,
      end: s.end,
    }));
    if (body.diarize) {
      segments = await new LocalSpeechProvider().diarize(segments);
    }
    const cleaned = segmentize(segments);

    return ingestTranscript({
      userId: user.id,
      recordingId: id,
      transcript: {
        provider: body.provider,
        language: body.language ?? undefined,
        durationSec: body.durationSec,
        segments: cleaned.map((s) => ({
          start: s.start,
          end: s.end,
          text: s.text,
          speaker: s.speaker,
          confidence: s.confidence,
          language: s.language,
        })),
      },
    });
  });
}

export const runtime = 'nodejs';
export const maxDuration = 300;
