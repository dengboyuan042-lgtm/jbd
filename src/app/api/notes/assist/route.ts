import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { buildContext } from '@/server/context';
import { parseBody, route } from '@/server/http';
import { ai } from '@/services/ai';
import type { TaskHint } from '@/services/ai/types';

const schema = z.object({
  action: z.enum([
    'rewrite',
    'summary',
    'expand',
    'translate',
    'explain',
    'continue',
    'key-points',
    'action-items',
  ]),
  text: z.string().min(1).max(30_000),
  instruction: z.string().max(500).optional(),
  targetLanguage: z.string().max(40).optional(),
  sourceIds: z.array(z.string()).default([]),
});

/** Writing assistant operations applied to a selection or a whole note. */
export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const body = await parseBody(request, schema);

    const task: TaskHint =
      body.action === 'rewrite'
        ? { kind: 'rewrite', instruction: body.instruction }
        : body.action === 'translate'
          ? { kind: 'translate', target: body.targetLanguage ?? 'English' }
          : body.action === 'summary'
            ? { kind: 'summary', style: 'brief' }
            : { kind: body.action };

    const context = body.sourceIds.length
      ? await buildContext({
          userId: user.id,
          sourceIds: body.sourceIds,
          query: body.text.slice(0, 500),
          maxTokens: 6000,
        })
      : [
          {
            id: 'selection',
            title: 'Selection',
            content: body.text,
            citation: { sourceId: 'selection', title: 'Selection', kind: 'note' as const },
          },
        ];

    const result = await ai.generate({
      task,
      messages: [{ role: 'user', content: body.text }],
      context,
      maxTokens: 1600,
    });

    return { content: result.text, citations: result.citations ?? [] };
  });
}

export const runtime = 'nodejs';
export const maxDuration = 120;
