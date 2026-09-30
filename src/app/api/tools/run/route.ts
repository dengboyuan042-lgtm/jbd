import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { parseBody, route } from '@/server/http';
import { TOOLS, runTool, type ToolId } from '@/services/tools';

export async function GET() {
  return route(async () => {
    await requireUser();
    return { tools: TOOLS };
  });
}

const schema = z.object({
  toolId: z.string(),
  sourceIds: z.array(z.string()).default([]),
  projectId: z.string().nullish(),
  title: z.string().max(200).optional(),
  save: z.boolean().default(true),
  options: z
    .object({
      count: z.number().int().min(1).max(50).optional(),
      difficulty: z.enum(['easy', 'medium', 'hard', 'mixed']).optional(),
      types: z.array(z.string()).optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const body = await parseBody(request, schema);
    return runTool({
      userId: user.id,
      toolId: body.toolId as ToolId,
      sourceIds: body.sourceIds,
      projectId: body.projectId ?? null,
      title: body.title,
      save: body.save,
      options: body.options,
    });
  });
}

export const runtime = 'nodejs';
export const maxDuration = 300;
