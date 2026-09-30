import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import {
  chats,
  memories,
  notes,
  projects,
  sources,
  tasks,
} from '@/server/db/schema';
import { notFound, parseBody, route } from '@/server/http';

async function load(userId: string, id: string) {
  const db = await getDb();
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, id), eq(projects.userId, userId), isNull(projects.deletedAt)),
  });
  if (!project) throw notFound('Project not found.');
  return { db, project };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const { db, project } = await load(user.id, id);

    const [projectSources, projectNotes, projectChats, projectTasks, projectMemories] =
      await Promise.all([
        db
          .select()
          .from(sources)
          .where(
            and(
              eq(sources.projectId, project.id),
              eq(sources.userId, user.id),
              isNull(sources.deletedAt),
            ),
          )
          .orderBy(desc(sources.updatedAt)),
        db
          .select()
          .from(notes)
          .where(
            and(
              eq(notes.projectId, project.id),
              eq(notes.userId, user.id),
              isNull(notes.deletedAt),
            ),
          )
          .orderBy(desc(notes.updatedAt)),
        db
          .select()
          .from(chats)
          .where(
            and(
              eq(chats.projectId, project.id),
              eq(chats.userId, user.id),
              isNull(chats.deletedAt),
            ),
          )
          .orderBy(desc(chats.updatedAt)),
        db
          .select()
          .from(tasks)
          .where(
            and(
              eq(tasks.projectId, project.id),
              eq(tasks.userId, user.id),
              isNull(tasks.deletedAt),
            ),
          )
          .orderBy(desc(tasks.createdAt)),
        db
          .select()
          .from(memories)
          .where(
            and(
              eq(memories.projectId, project.id),
              eq(memories.userId, user.id),
              isNull(memories.deletedAt),
            ),
          )
          .orderBy(desc(memories.updatedAt)),
      ]);

    return {
      project,
      sources: projectSources,
      notes: projectNotes,
      chats: projectChats,
      tasks: projectTasks,
      memories: projectMemories,
    };
  });
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullish(),
  goal: z.string().max(2000).nullish(),
  color: z.string().max(20).optional(),
  archived: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const { db, project } = await load(user.id, id);
    const patch = await parseBody(request, patchSchema);
    const [updated] = await db
      .update(projects)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(projects.id, project.id))
      .returning();
    return { project: updated };
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const { db, project } = await load(user.id, id);
    await db
      .update(projects)
      .set({ deletedAt: new Date() })
      .where(eq(projects.id, project.id));
    return { ok: true };
  });
}
