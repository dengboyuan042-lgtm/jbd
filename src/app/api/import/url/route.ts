import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { parseBody, route } from '@/server/http';
import { ingestUrl } from '@/services/knowledge/ingest';

const schema = z.object({
  url: z.string().min(4),
  projectId: z.string().nullish(),
});

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const { url, projectId } = await parseBody(request, schema);
    return ingestUrl({ userId: user.id, projectId: projectId ?? null, url });
  });
}

export const runtime = 'nodejs';
export const maxDuration = 120;
