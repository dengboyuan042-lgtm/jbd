import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { chats, messages } from '@/server/db/schema';
import { notFound, parseBody, route } from '@/server/http';

async function load(userId: string, id: string) {
  const db = await getDb();
  const chat = await db.query.chats.findFirst({
    where: and(eq(chats.id, id), eq(chats.userId, userId), isNull(chats.deletedAt)),
  });
  if (!chat) throw notFound('Conversation not found.');
  return { db, chat };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const { db, chat } = await load(user.id, id);
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chat.id))
      .orderBy(asc(messages.createdAt));
    return { chat, messages: rows };
  });
}

const patchSchema = z.object({
  title: z.string().max(200).optional(),
  projectId: z.string().nullish(),
  contextSourceIds: z.array(z.string()).optional(),
  mode: z.enum(['chat', 'agent']).optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const { db, chat } = await load(user.id, id);
    const patch = await parseBody(request, patchSchema);
    const [updated] = await db
      .update(chats)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(chats.id, chat.id))
      .returning();
    return { chat: updated };
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const { db, chat } = await load(user.id, id);
    await db.update(chats).set({ deletedAt: new Date() }).where(eq(chats.id, chat.id));
    return { ok: true };
  });
}
