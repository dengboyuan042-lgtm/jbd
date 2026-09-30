import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';

import { ids } from '@/lib/id';
import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { projects, sources, tasks } from '@/server/db/schema';
import { parseBody, route } from '@/server/http';

export async function GET() {
  return route(async () => {
    const user = await requireUser();
    const db = await getDb();

    const rows = await db
      .select()
      .from(projects)
      .where(and(eq(projects.userId, user.id), isNull(projects.deletedAt)))
      .orderBy(desc(projects.updatedAt));

    const counts = await db
      .select({
        projectId: sources.projectId,
        count: sql<number>`count(*)::int`,
      })
      .from(sources)
      .where(and(eq(sources.userId, user.id), isNull(sources.deletedAt)))
      .groupBy(sources.projectId);
    const byProject = new Map(counts.map((c) => [c.projectId, Number(c.count)]));

    const openTasks = await db
      .select({ projectId: tasks.projectId, count: sql<number>`count(*)::int` })
      .from(tasks)
      .where(
        and(eq(tasks.userId, user.id), isNull(tasks.deletedAt), eq(tasks.status, 'open')),
      )
      .groupBy(tasks.projectId);
    const tasksByProject = new Map(openTasks.map((c) => [c.projectId, Number(c.count)]));

    return {
      projects: rows.map((p) => ({
        ...p,
        sourceCount: byProject.get(p.id) ?? 0,
        openTaskCount: tasksByProject.get(p.id) ?? 0,
      })),
    };
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullish(),
  goal: z.string().max(2000).nullish(),
  color: z.string().max(20).default('slate'),
});

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const body = await parseBody(request, createSchema);
    const db = await getDb();
    const [project] = await db
      .insert(projects)
      .values({
        id: ids.project(),
        userId: user.id,
        name: body.name,
        description: body.description ?? null,
        goal: body.goal ?? null,
        color: body.color,
      })
      .returning();
    return { project };
  });
}

