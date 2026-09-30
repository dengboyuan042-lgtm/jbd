'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessageSquarePlus, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Page, PageHeader } from '@/components/shell/page';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/primitives';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { cn, relativeTime } from '@/lib/utils';
import { usePanel } from '@/features/workspace/workspace-context';
import { ChatThread } from './chat-thread';

type ChatRow = { id: string; title: string; updatedAt: string; mode: string };

/**
 * Full-width conversation surface with a history rail. The right panel is
 * hidden here — the conversation *is* the page.
 */
export function ChatWorkspace({ chatId }: { chatId?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const initialQuery = params.get('q');
  const initialAgent = params.get('agent') === '1';

  const { data, loading, refresh } = useApi<{ chats: ChatRow[] }>('/api/chats');

  usePanel({ mode: 'hidden' }, []);

  return (
    <Page>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-bg-subtle lg:flex">
          <div className="flex h-(--topbar-h) shrink-0 items-center gap-2 px-3">
            <span className="text-xs font-medium text-fg">Conversations</span>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => router.push('/chat')}
              aria-label="New conversation"
            >
              <MessageSquarePlus />
            </Button>
          </div>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 scrollbar-thin">
            {loading ? (
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-7 w-full" />)
            ) : data?.chats.length ? (
              data.chats.map((chat) => (
                <div key={chat.id} className="group relative">
                  <Link
                    href={`/chat/${chat.id}`}
                    className={cn(
                      'flex h-7 items-center gap-2 rounded-md px-2 text-xs transition-colors',
                      chat.id === chatId
                        ? 'bg-surface-active font-medium text-fg'
                        : 'text-secondary hover:bg-surface-hover hover:text-fg',
                    )}
                  >
                    <Sparkles className="size-3 shrink-0 text-tertiary" />
                    <span className="min-w-0 flex-1 truncate">{chat.title}</span>
                  </Link>
                  <Menu>
                    <MenuTrigger asChild>
                      <button
                        type="button"
                        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-tertiary opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
                        aria-label="Conversation options"
                      >
                        <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor">
                          <circle cx="5" cy="12" r="1.8" />
                          <circle cx="12" cy="12" r="1.8" />
                          <circle cx="19" cy="12" r="1.8" />
                        </svg>
                      </button>
                    </MenuTrigger>
                    <MenuContent>
                      <MenuItem
                        icon={<Trash2 />}
                        destructive
                        onSelect={async () => {
                          await api.delete(`/api/chats/${chat.id}`);
                          toast.success('Conversation deleted');
                          if (chat.id === chatId) router.push('/chat');
                          refresh();
                        }}
                      >
                        Delete
                      </MenuItem>
                    </MenuContent>
                  </Menu>
                </div>
              ))
            ) : (
              <p className="px-2 py-6 text-center text-xs text-tertiary">
                No conversations yet.
              </p>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {chatId ? (
            <ChatThread key={chatId} chatId={chatId} variant="page" />
          ) : (
            <NewChat initialQuery={initialQuery} initialAgent={initialAgent} onCreated={refresh} />
          )}
        </div>
      </div>
    </Page>
  );
}

/** A fresh conversation, optionally seeded with a question from elsewhere. */
function NewChat({
  initialQuery,
  initialAgent,
  onCreated,
}: {
  initialQuery: string | null;
  initialAgent: boolean;
  onCreated: () => void;
}) {
  return (
    <ChatThread
      variant="page"
      initialMessage={initialQuery}
      initialAgent={initialAgent}
      onChatCreated={(created) => {
        onCreated();
        // Give the URL an identity without tearing down the streaming thread.
        window.history.replaceState(null, '', `/chat/${created.id}`);
      }}
      emptyTitle="What do you want to work on?"
      emptyDescription="Ask across everything in your workspace. Answers cite the page, timestamp or section they came from. Switch on Agent to let it create notes, decks and projects for you."
      suggestions={[
        'What did I work on this week?',
        'Summarise my most recent document',
        'Turn my latest meeting into action items',
      ]}
    />
  );
}

