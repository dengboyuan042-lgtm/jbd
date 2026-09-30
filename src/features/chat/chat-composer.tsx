'use client';

import * as React from 'react';
import { ArrowUp, Mic, Paperclip, Square, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { AutoTextarea } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { cn, formatBytes } from '@/lib/utils';
import type { MessageAttachment } from '@/server/db/schema';
import { useSpeechRecognition } from '@/features/voice/use-speech-recognition';

export type ComposerSubmit = (
  content: string,
  options: { agent: boolean; attachments: MessageAttachment[] },
) => void;

export function ChatComposer({
  onSubmit,
  onStop,
  sending,
  projectId,
  placeholder = 'Ask about your material…',
  compact,
  autoFocus,
  agentAvailable = true,
}: {
  onSubmit: ComposerSubmit;
  onStop?: () => void;
  sending?: boolean;
  projectId?: string | null;
  placeholder?: string;
  compact?: boolean;
  autoFocus?: boolean;
  agentAvailable?: boolean;
}) {
  const [value, setValue] = React.useState('');
  const [agent, setAgent] = React.useState(false);
  const [attachments, setAttachments] = React.useState<MessageAttachment[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const startedAt = React.useRef(0);

  const speech = useSpeechRecognition({
    getElapsed: () => (Date.now() - startedAt.current) / 1000,
    onSegment: (segment) =>
      setValue((prev) => `${prev ? `${prev.trimEnd()} ` : ''}${segment.text}`),
  });

  const submit = () => {
    const text = [value, speech.interim].filter(Boolean).join(' ').trim();
    if (!text || sending) return;
    onSubmit(text, { agent, attachments });
    setValue('');
    setAttachments([]);
    if (speech.listening) speech.stop();
  };

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    const form = new FormData();
    list.forEach((file) => form.append('files', file));
    if (projectId) form.append('projectId', projectId);
    try {
      const data = await api.upload<{
        results: { sourceId: string; title: string; kind: string; chunks: number; warning?: string }[];
        errors: { name: string; error: string }[];
      }>('/api/files/upload', form);

      setAttachments((prev) => [
        ...prev,
        ...data.results.map((r, i) => ({
          id: r.sourceId,
          name: r.title,
          kind: (list[i]?.type.startsWith('image/') ? 'image' : 'file') as 'image' | 'file',
          mimeType: list[i]?.type,
          size: list[i]?.size,
          sourceId: r.sourceId,
        })),
      ]);
      data.results.forEach((r) => r.warning && toast.warning(r.title, { description: r.warning }));
      data.errors.forEach((e) => toast.error(e.name, { description: e.error }));
    } catch (error) {
      toast.error('Upload failed', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUploading(false);
    }
  };

  const toggleMic = () => {
    if (speech.listening) {
      speech.stop();
      return;
    }
    startedAt.current = Date.now();
    speech.start();
  };

  React.useEffect(() => {
    if (speech.error) toast.error(speech.error);
  }, [speech.error]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
      }}
      className={cn(
        'relative rounded-xl border bg-surface shadow-sm transition-[border-color,box-shadow]',
        dragging ? 'border-accent ring-3 ring-[var(--accent-subtle)]' : 'border-border',
      )}
    >
      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-accent-subtle/85 text-xs font-medium text-accent-text">
          Drop to attach
        </div>
      ) : null}

      {attachments.length ? (
        <div className="flex flex-wrap gap-1.5 border-b border-border px-2.5 pb-2 pt-2.5">
          {attachments.map((attachment) => (
            <span
              key={attachment.id}
              className="inline-flex max-w-52 items-center gap-1.5 rounded-md border border-border bg-bg-sunken py-1 pl-2 pr-1 text-2xs text-secondary"
            >
              <Paperclip className="size-3 shrink-0 text-tertiary" />
              <span className="truncate">{attachment.name}</span>
              {attachment.size ? (
                <span className="shrink-0 text-tertiary">{formatBytes(attachment.size)}</span>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  setAttachments((prev) => prev.filter((a) => a.id !== attachment.id))
                }
                className="rounded-xs p-0.5 text-tertiary hover:bg-surface-active hover:text-fg"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className={cn('px-3', compact ? 'pt-2.5' : 'pt-3')}>
        <AutoTextarea
          value={speech.interim ? `${value}${value ? ' ' : ''}${speech.interim}` : value}
          autoFocus={autoFocus}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          maxRows={compact ? 7 : 12}
          rows={1}
        />
      </div>

      <div className="flex items-center gap-1 px-2 pb-2 pt-1.5">
        <input
          ref={inputRef}
          type="file"
          multiple
          hidden
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
        <Tooltip content="Attach files">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => inputRef.current?.click()}
            loading={uploading}
            aria-label="Attach files"
          >
            <Paperclip />
          </Button>
        </Tooltip>

        <Tooltip content={speech.listening ? 'Stop dictation' : 'Dictate'}>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleMic}
            className={cn(speech.listening && 'text-danger')}
            aria-label="Dictate"
          >
            <Mic className={cn(speech.listening && 'animate-pulse')} />
          </Button>
        </Tooltip>

        {agentAvailable ? (
          <Tooltip content="Agent mode — lets the assistant use workspace tools">
            <button
              type="button"
              onClick={() => setAgent((v) => !v)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors',
                agent
                  ? 'bg-accent-subtle text-accent-text'
                  : 'text-tertiary hover:bg-surface-hover hover:text-secondary',
              )}
            >
              <Wand2 className="size-3.5" />
              Agent
            </button>
          </Tooltip>
        ) : null}

        <div className="flex-1" />

        {sending ? (
          <Button variant="secondary" size="icon-sm" onClick={onStop} aria-label="Stop">
            <Square className="fill-current" />
          </Button>
        ) : (
          <Button
            variant="primary"
            size="icon-sm"
            onClick={submit}
            disabled={!value.trim() && !speech.interim}
            aria-label="Send"
          >
            <ArrowUp />
          </Button>
        )}
      </div>
    </div>
  );
}
