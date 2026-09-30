'use client';

import * as React from 'react';

import { ApiError, api, streamSse } from '@/lib/api';
import type { AgentStepRecord, Citation, MessageAttachment } from '@/server/db/schema';

export type ChatMessageView = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations: Citation[];
  attachments: MessageAttachment[];
  steps: AgentStepRecord[];
  createdAt: string;
  streaming?: boolean;
};

export type ChatRecord = {
  id: string;
  title: string;
  projectId: string | null;
  contextSourceIds: string[];
  mode: 'chat' | 'agent';
};

type Options = {
  chatId?: string | null;
  projectId?: string | null;
  sourceIds?: string[];
  onChatCreated?: (chat: ChatRecord) => void;
  onArtifact?: (artifact: { kind: string; id: string; title: string; href: string }) => void;
};

/** Owns conversation state, streaming and lazy chat creation. */
export function useChat(options: Options) {
  const [chat, setChat] = React.useState<ChatRecord | null>(null);
  const [messages, setMessages] = React.useState<ChatMessageView[]>([]);
  const [loading, setLoading] = React.useState(Boolean(options.chatId));
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const { chatId, projectId, onChatCreated, onArtifact } = options;
  const sourceKey = (options.sourceIds ?? []).join(',');

  React.useEffect(() => {
    if (!chatId) {
      setChat(null);
      setMessages([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<{ chat: ChatRecord; messages: ChatMessageView[] }>(`/api/chats/${chatId}`)
      .then((data) => {
        if (cancelled) return;
        setChat(data.chat);
        setMessages(data.messages);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Could not load chat.');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [chatId]);

  const ensureChat = React.useCallback(async (): Promise<ChatRecord> => {
    if (chat) return chat;
    const { chat: created } = await api.post<{ chat: ChatRecord }>('/api/chats', {
      projectId: projectId ?? null,
      contextSourceIds: sourceKey ? sourceKey.split(',') : [],
    });
    setChat(created);
    onChatCreated?.(created);
    return created;
  }, [chat, projectId, sourceKey, onChatCreated]);

  const stop = React.useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
  }, []);

  const send = React.useCallback(
    async (
      content: string,
      options: { agent?: boolean; attachments?: MessageAttachment[] } = {},
    ) => {
      if (!content.trim() || sending) return;
      setError(null);
      setSending(true);

      const target = await ensureChat().catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Could not start a conversation.');
        setSending(false);
        return null;
      });
      if (!target) return;

      const optimisticUser: ChatMessageView = {
        id: `tmp-${Date.now()}`,
        role: 'user',
        content,
        citations: [],
        attachments: options.attachments ?? [],
        steps: [],
        createdAt: new Date().toISOString(),
      };
      const assistantPlaceholder: ChatMessageView = {
        id: `tmp-assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        citations: [],
        attachments: [],
        steps: [],
        createdAt: new Date().toISOString(),
        streaming: true,
      };
      setMessages((prev) => [...prev, optimisticUser, assistantPlaceholder]);

      const controller = new AbortController();
      abortRef.current = controller;

      const patchAssistant = (updater: (m: ChatMessageView) => ChatMessageView) =>
        setMessages((prev) => {
          const next = [...prev];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].role === 'assistant') {
              next[i] = updater(next[i]);
              break;
            }
          }
          return next;
        });

      try {
        await streamSse(
          options.agent ? '/api/agent/stream' : '/api/chat/stream',
          {
            chatId: target.id,
            content,
            sourceIds: sourceKey ? sourceKey.split(',') : [],
            ...(options.agent ? {} : { attachments: options.attachments ?? [] }),
          },
          (event) => {
            switch (event.type) {
              case 'user-message':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === optimisticUser.id ? { ...m, id: String(event.id) } : m,
                  ),
                );
                break;
              case 'assistant-start':
                patchAssistant((m) => ({ ...m, id: String(event.id) }));
                break;
              case 'delta':
                patchAssistant((m) => ({ ...m, content: m.content + String(event.value) }));
                break;
              case 'citations':
                patchAssistant((m) => ({ ...m, citations: event.value as Citation[] }));
                break;
              case 'step': {
                const step = {
                  id: String(event.id),
                  label: String(event.label),
                  status: String(event.status) as AgentStepRecord['status'],
                  detail: event.detail ? String(event.detail) : undefined,
                };
                patchAssistant((m) => {
                  const steps = [...m.steps];
                  const index = steps.findIndex((s) => s.id === step.id);
                  if (index === -1) steps.push(step);
                  else steps[index] = { ...steps[index], ...step };
                  return { ...m, steps };
                });
                break;
              }
              case 'artifact':
                onArtifact?.(
                  event.value as { kind: string; id: string; title: string; href: string },
                );
                break;
              case 'title':
                setChat((prev) => (prev ? { ...prev, title: String(event.value) } : prev));
                break;
              case 'assistant-done':
                patchAssistant((m) => ({
                  ...m,
                  streaming: false,
                  citations: (event.citations as Citation[]) ?? m.citations,
                }));
                break;
              case 'error':
                setError(String(event.message));
                break;
              default:
                break;
            }
          },
          controller.signal,
        );
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError(err instanceof ApiError ? err.message : 'The response failed.');
        }
      } finally {
        patchAssistant((m) => ({ ...m, streaming: false }));
        setSending(false);
        abortRef.current = null;
      }
    },
    [ensureChat, sending, sourceKey, onArtifact],
  );

  return { chat, messages, loading, sending, error, send, stop, setMessages, setChat };
}
