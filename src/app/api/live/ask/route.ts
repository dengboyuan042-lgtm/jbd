import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { parseBody, route } from '@/server/http';
import { ai } from '@/services/ai';

const schema = z.object({
  question: z.string().min(1).max(2000),
  transcript: z.string().max(60_000),
});

/** Answer a question against an in-progress transcript that is not yet saved. */
export async function POST(request: Request) {
  return route(async () => {
    await requireUser();
    const { question, transcript } = await parseBody(request, schema);

    if (transcript.trim().length < 40) {
      return { content: 'There is not enough of the session captured yet to answer that.' };
    }

    const result = await ai.generate({
      task: { kind: 'chat' },
      messages: [{ role: 'user', content: question }],
      context: [
        {
          id: 'live',
          title: 'Live session transcript',
          content: transcript.slice(-24_000),
          citation: { sourceId: 'live', title: 'Live session', kind: 'recording' },
        },
      ],
      maxTokens: 700,
    });

    return { content: result.text };
  });
}

export const runtime = 'nodejs';
