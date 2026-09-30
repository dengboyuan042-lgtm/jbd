import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { parseBody, route } from '@/server/http';
import { ai } from '@/services/ai';

const schema = z.object({ transcript: z.string().max(60_000) });

/** Rolling summary of what has been said so far in a live session. */
export async function POST(request: Request) {
  return route(async () => {
    await requireUser();
    const { transcript } = await parseBody(request, schema);
    if (transcript.trim().length < 200) return { content: '' };

    const result = await ai.task(
      { kind: 'summary', style: 'bullets' },
      {
        context: [
          {
            id: 'live',
            title: 'Live session',
            content: transcript,
            citation: { sourceId: 'live', title: 'Live session', kind: 'recording' },
          },
        ],
      },
    );
    return { content: result.text };
  });
}

export const runtime = 'nodejs';
