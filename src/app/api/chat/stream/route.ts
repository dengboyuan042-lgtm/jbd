import { and, asc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { ids } from '@/lib/id';
import { requireUser } from '@/server/auth';
import { buildContext, buildMemoryPrompt } from '@/server/context';
import { getDb } from '@/server/db/client';
import { chats, messages, type Citation } from '@/server/db/schema';
import { notFound, parseBody, toErrorResponse } from '@/server/http';
import { sseStream } from '@/server/sse';
import { ai } from '@/services/ai';
import type { ChatMessage } from '@/services/ai/types';

const schema = z.object({
  chatId: z.string(),
  content: z.string().min(1).max(20_000),
  sourceIds: z.array(z.string()).optional(),
  attachments: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        kind: z.enum(['file', 'image', 'audio', 'url']),
        mimeType: z.string().optional(),
        url: z.string().optional(),
        sourceId: z.string().optional(),
        size: z.number().optional(),
      }),
    )
    .default([]),
  model: z.string().optional(),
});

/** History window kept small enough to leave room for retrieved material. */
const HISTORY_TURNS = 12;

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
      attachments: payload.attachments,
    });
    emit({ type: 'user-message', id: userMessageId });

    const assistantId = ids.message();
    emit({ type: 'assistant-start', id: assistantId });

    emit({ type: 'step', id: 'retrieve', label: 'Searching your sources', status: 'running' });

    const scopedSourceIds = [
      ...new Set([
        ...(payload.sourceIds ?? []),
        ...(chat.contextSourceIds ?? []),
        ...payload.attachments.map((a) => a.sourceId).filter(Boolean as unknown as (v: string | undefined) => v is string),
      ]),
    ];

    const context = await buildContext({
      userId,
      query: payload.content,
      sourceIds: scopedSourceIds.length ? scopedSourceIds : undefined,
      projectId: chat.projectId,
    });

    emit({
      type: 'step',
      id: 'retrieve',
      label: context.length
        ? `Read ${context.length} passage${context.length === 1 ? '' : 's'}`
        : 'No matching passages',
      status: 'done',
    });

    const history = await db
      .select()
      .from(messages)
      .where(eq(messages.chatId, chat.id))
      .orderBy(asc(messages.createdAt));

    const conversation: ChatMessage[] = history
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role as ChatMessage['role'], content: m.content }));

    const memoryPrompt = await buildMemoryPrompt(userId, chat.projectId);

    emit({ type: 'step', id: 'answer', label: 'Composing answer', status: 'running' });

    let text = '';
    let citations: Citation[] = context.map((c) => c.citation);
    let model = 'unknown';

    try {
      for await (const chunk of ai.stream({
        messages: conversation,
        context,
        system: memoryPrompt || undefined,
        model: payload.model,
        task: { kind: 'chat' },
        signal,
      })) {
        if (chunk.type === 'text') {
          text += chunk.value;
          emit({ type: 'delta', value: chunk.value });
        } else if (chunk.type === 'citations') {
          citations = chunk.value;
          emit({ type: 'citations', value: chunk.value });
        } else if (chunk.type === 'error') {
          emit({ type: 'error', message: chunk.value });
        } else if (chunk.type === 'done') {
          model = chunk.value.model;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Generation failed.';
      emit({ type: 'error', message });
      text ||= `_${message}_`;
    }

    emit({ type: 'step', id: 'answer', label: 'Answer ready', status: 'done' });

    // Only keep citations the answer actually referenced.
    const referenced = new Set(
      [...text.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])),
    );
    const finalCitations = referenced.size
      ? citations.filter((_, i) => referenced.has(i + 1))
      : citations.slice(0, 4);

    await db.insert(messages).values({
      id: assistantId,
      userId,
      chatId: chat.id,
      role: 'assistant',
      content: text,
      citations: referenced.size ? citations : finalCitations,
      model,
    });

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (chat.title === 'New chat') {
      const title = await ai.title(payload.content);
      updates.title = title;
      emit({ type: 'title', value: title });
    }
    await db.update(chats).set(updates).where(eq(chats.id, chat.id));

    emit({
      type: 'assistant-done',
      id: assistantId,
      citations: referenced.size ? citations : finalCitations,
      model,
    });
  });
}

export const runtime = 'nodejs';
export const maxDuration = 300;
