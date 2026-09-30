'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, EmptyState, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import type { AgentStepRecord } from '@/server/db/schema';
import { useWorkspace } from '@/features/workspace/workspace-context';
import { ChatComposer } from './chat-composer';
import { CitationList } from './citation';
import { Markdown } from './markdown';
import { useChat, type ChatMessageView, type ChatRecord } from './use-chat';

export function ChatThread({
  chatId,
  projectId,
  sourceIds,
  initialMessage,
  initialAgent,
  variant = 'page',
  emptyTitle = 'Ask about your material',
  emptyDescription,
  suggestions = [],
  onChatCreated,
  className,
}: {
  chatId?: string | null;
  projectId?: string | null;
  sourceIds?: string[];
  /** sent automatically on mount — used when arriving from Home or the palette */
  initialMessage?: string | null;
  initialAgent?: boolean;
  variant?: 'page' | 'panel';
  emptyTitle?: string;
  emptyDescription?: string;
  suggestions?: string[];
  onChatCreated?: (chat: ChatRecord) => void;
  className?: string;
}) {
  const { user } = useWorkspace();
  const [artifacts, setArtifacts] = React.useState<
    { kind: string; id: string; title: string; href: string }[]
  >([]);

  const { messages, loading, sending, error, send, stop } = useChat({
    chatId,
    projectId,
    sourceIds,
    onChatCreated,
    onArtifact: (artifact) => setArtifacts((prev) => [...prev, artifact]),
  });

  // Fire the incoming question exactly once, without remounting the thread.
  const autoSent = React.useRef(false);
  React.useEffect(() => {
    if (!initialMessage || autoSent.current || loading) return;
    autoSent.current = true;
    void send(initialMessage, { agent: Boolean(initialAgent) });
  }, [initialMessage, initialAgent, loading, send]);

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pinnedToBottom = React.useRef(true);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const compact = variant === 'panel';

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto scrollbar-thin"
      >
        <div className={cn('mx-auto w-full', compact ? 'px-3 py-3' : 'max-w-3xl px-5 py-6')}>
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-16 w-4/5" />
            </div>
          ) : messages.length === 0 ? (
            <EmptyState
              compact={compact}
              icon={<Sparkles />}
              title={emptyTitle}
              description={
                emptyDescription ??
                (sourceIds?.length
                  ? 'Answers are grounded in the sources in view, with page and timestamp citations.'
                  : 'Attach a file, pick sources, or just start typing. Answers cite where they came from.')
              }
            />
          ) : (
            <div className={cn(compact ? 'space-y-4' : 'space-y-6')}>
              {messages.map((message) => (
                <MessageRow
                  key={message.id}
                  message={message}
                  userName={user.name}
                  avatarUrl={user.avatarUrl}
                  compact={compact}
                />
              ))}
            </div>
          )}

          {artifacts.length ? (
            <div className="mt-5 space-y-1.5">
              <p className="text-2xs font-semibold uppercase tracking-[0.07em] text-tertiary">
                Created
              </p>
              {artifacts.map((artifact) => (
                <Link
                  key={`${artifact.kind}-${artifact.id}`}
                  href={artifact.href}
                  className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-2 text-xs text-fg transition-colors hover:border-border-strong"
                >
                  <span className="rounded-xs bg-accent-subtle px-1 py-0.5 text-2xs text-accent-text">
                    {artifact.kind}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{artifact.title}</span>
                  <ChevronRight className="size-3.5 shrink-0 text-tertiary" />
                </Link>
              ))}
            </div>
          ) : null}

          {error ? (
            <div className="mt-4 flex items-start gap-2 rounded-md border border-danger-border bg-danger-subtle px-3 py-2 text-xs text-danger">
              <CircleAlert className="mt-px size-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      </div>

      {!messages.length && suggestions.length ? (
        <div
          className={cn(
            'flex flex-wrap gap-1.5',
            compact ? 'px-3 pb-2' : 'mx-auto w-full max-w-3xl px-5 pb-2',
          )}
        >
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => send(suggestion, {})}
              className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-secondary transition-colors hover:border-border-strong hover:text-fg"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      <div className={cn(compact ? 'p-3 pt-1' : 'mx-auto w-full max-w-3xl px-5 pb-5 pt-1')}>
        <ChatComposer
          compact={compact}
          sending={sending}
          projectId={projectId}
          onStop={stop}
          onSubmit={(content, options) =>
            send(content, { agent: options.agent, attachments: options.attachments })
          }
        />
      </div>
    </div>
  );
}

function MessageRow({
  message,
  userName,
  avatarUrl,
  compact,
}: {
  message: ChatMessageView;
  userName: string;
  avatarUrl: string | null;
  compact: boolean;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end gap-2.5">
        <div className="max-w-[85%] space-y-1.5">
          {message.attachments.length ? (
            <div className="flex flex-wrap justify-end gap-1">
              {message.attachments.map((a) => (
                <span
                  key={a.id}
                  className="rounded-md border border-border bg-surface px-1.5 py-0.5 text-2xs text-secondary"
                >
                  {a.name}
                </span>
              ))}
            </div>
          ) : null}
          <div className="rounded-xl rounded-tr-sm bg-bg-sunken px-3 py-2 text-sm leading-relaxed text-fg">
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          </div>
        </div>
        {compact ? null : <Avatar name={userName} src={avatarUrl} size={24} className="mt-0.5" />}
      </div>
    );
  }

  return (
    <div className="group/message space-y-2">
      {message.steps.length ? <StepTrail steps={message.steps} /> : null}

      {message.content ? (
        <Markdown content={message.content} citations={message.citations} compact={compact} />
      ) : message.streaming ? (
        <div className="flex items-center gap-2 text-xs text-tertiary">
          <Loader2 className="size-3 animate-spin" />
          Thinking
        </div>
      ) : null}

      {message.streaming && message.content ? (
        <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-blink bg-fg align-middle" />
      ) : null}

      {!message.streaming && message.citations.length ? (
        <CitationList citations={message.citations} className="pt-0.5" />
      ) : null}

      {!message.streaming && message.content ? (
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/message:opacity-100">
          <CopyButton text={message.content} />
        </div>
      ) : null}
    </div>
  );
}

function StepTrail({ steps }: { steps: AgentStepRecord[] }) {
  const [expanded, setExpanded] = React.useState(false);
  const active = steps.some((s) => s.status === 'running');
  const visible = expanded ? steps : steps.slice(-1);

  return (
    <div className="rounded-lg border border-border bg-bg-subtle px-2.5 py-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span className="text-2xs font-medium uppercase tracking-wide text-tertiary">
          {active ? 'Working' : 'Completed'}
        </span>
        <span className="text-2xs text-tertiary">
          {steps.filter((s) => s.status === 'done').length}/{steps.length}
        </span>
        <ChevronRight
          className={cn(
            'ml-auto size-3 text-tertiary transition-transform',
            expanded && 'rotate-90',
          )}
        />
      </button>
      <ul className="mt-1.5 space-y-1">
        {visible.map((step) => (
          <li key={step.id} className="flex items-start gap-2 text-xs">
            <span className="mt-[3px] shrink-0">
              {step.status === 'running' ? (
                <Loader2 className="size-3 animate-spin text-accent" />
              ) : step.status === 'error' ? (
                <CircleAlert className="size-3 text-danger" />
              ) : (
                <Check className="size-3 text-success" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn(step.status === 'error' ? 'text-danger' : 'text-secondary')}>
                {step.label}
              </span>
              {expanded && step.detail ? (
                <span className="mt-0.5 block truncate text-2xs text-tertiary">{step.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error('Clipboard unavailable');
        }
      }}
      className="rounded-sm p-1 text-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
      aria-label="Copy answer"
    >
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
    </button>
  );
}
