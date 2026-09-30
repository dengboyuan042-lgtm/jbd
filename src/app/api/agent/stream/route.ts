import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { ids } from '@/lib/id';
import { requireUser } from '@/server/auth';
import { buildMemoryPrompt } from '@/server/context';
import { getDb } from '@/server/db/client';
import { chats, messages, type AgentStepRecord } from '@/server/db/schema';
import { notFound, parseBody, toErrorResponse } from '@/server/http';
import { sseStream } from '@/server/sse';
import { ai } from '@/services/ai';
import type { ChatMessage } from '@/services/ai/types';
import { runAgent } from '@/services/agent';

const schema = z.object({
  chatId: z.string(),
  content: z.string().min(1).max(20_000),
  sourceIds: z.array(z.string()).default([]),
});

export async function POST(request: Request) {
  let payload: z.infer<typeof schema>;
  let userId: string;
  try {
    const user = await requireUser();
    userId = user.id;
    payload = await parseBody(request, schema);
  } catch (error) {
    return toErrorResponse(error);
  }

  return sseStream(async (emit, signal) => {
    const db = await getDb();
    const chat = await db.query.chats.findFirst({
      where: and(eq(chats.id, payload.chatId), eq(chats.userId, userId), isNull(chats.deletedAt)),
    });
    if (!chat) throw notFound('Conversation not found.');

    const userMessageId = ids.message();
    await db.insert(messages).values({
      id: userMessageId,
      userId,
      chatId: chat.id,
      role: 'user',
      content: payload.content,
    });
    emit({ type: 'user-message', id: userMessageId });

    const assistantId = ids.message();
    emit({ type: 'assistant-start', id: assistantId });

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chat.id))
      .orderBy(asc(messages.createdAt));

    const memoryPrompt = await buildMemoryPrompt(userId, chat.projectId);
    const conversation: ChatMessage[] = [
      ...(memoryPrompt ? [{ role: 'system' as const, content: memoryPrompt }] : []),
      ...history.slice(-10).map((m) => ({
        role: m.role as ChatMessage['role'],
        content: m.content,
      })),
    ];

    const steps: AgentStepRecord[] = [];
    let text = '';

    for await (const event of runAgent({
      context: {
        userId,
        projectId: chat.projectId,
        focusSourceIds: [
          ...new Set([...(payload.sourceIds ?? []), ...(chat.contextSourceIds ?? [])]),
        ],
      },
      messages: conversation,
      signal,
    })) {
      if (event.type === 'step') {
        const existing = steps.find((s) => s.id === event.id);
        if (existing) {
          existing.status = event.status === 'running' ? 'running' : event.status === 'error' ? 'error' : 'done';
          existing.detail = event.detail ?? existing.detail;
          existing.finishedAt = new Date().toISOString();
        } else {
          steps.push({
            id: event.id,
            label: event.label,
            status: event.status === 'running' ? 'running' : 'done',
            detail: event.detail,
            startedAt: new Date().toISOString(),
          });
        }
        emit(event as unknown as Record<string, unknown> & { type: string });
      } else if (event.type === 'delta') {
        text += event.value;
        emit({ type: 'delta', value: event.value });
      } else if (event.type === 'artifact') {
        emit({ type: 'artifact', value: event.value });
      } else if (event.type === 'error') {
        emit({ type: 'error', message: event.message });
      }
    }

    await db.insert(messages).values({
      id: assistantId,
      userId,
      chatId: chat.id,
      role: 'assistant',
      content: text || '_No output was produced._',
      steps,
    });

    const updates: Record<string, unknown> = { updatedAt: new Date(), mode: 'agent' };
    if (chat.title === 'New chat') {
      const title = await ai.title(payload.content);
      updates.title = title;
      emit({ type: 'title', value: title });
    }
    await db.update(chats).set(updates).where(eq(chats.id, chat.id));

    emit({ type: 'assistant-done', id: assistantId, steps });
  });
}

export const runtime = 'nodejs';
export const maxDuration = 600;
