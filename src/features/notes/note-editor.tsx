'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Bold,
  Code,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  ListChecks,
  Pin,
  Quote,
  Table,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Segmented, Skeleton, Tooltip } from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { cn, relativeTime } from '@/lib/utils';
import { Markdown } from '@/features/chat/markdown';
import { noteBridge } from './note-bridge';

type Note = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  updatedAt: string;
  projectId: string | null;
};

const SAVE_DELAY = 900;

export function NoteEditor({
  noteId,
  onSaved,
}: {
  noteId: string;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const { data, loading } = useApi<{ note: Note }>(`/api/notes/${noteId}`);

  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');
  const [pinned, setPinned] = React.useState(false);
  const [view, setView] = React.useState<'write' | 'split' | 'read'>('write');
  const [status, setStatus] = React.useState<'idle' | 'saving' | 'saved'>('idle');
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const loadedId = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!data?.note || loadedId.current === data.note.id) return;
    loadedId.current = data.note.id;
    setTitle(data.note.title);
    setContent(data.note.content);
    setPinned(data.note.pinned);
  }, [data]);

  /* Expose the editor to the writing assistant. */
  React.useEffect(() => {
    return noteBridge.connect({
      getContent: () => content,
      replaceRange: (start, end, text) => {
        setContent((prev) => prev.slice(0, start) + text + prev.slice(end));
      },
      append: (text) => setContent((prev) => prev + text),
    });
  }, [content]);

  /* Debounced autosave. */
  const dirty = React.useRef(false);
  React.useEffect(() => {
    if (!loadedId.current) return;
    if (!dirty.current) return;
    setStatus('saving');
    const timer = setTimeout(async () => {
      try {
        await api.patch(`/api/notes/${noteId}`, { title, content, pinned });
        setStatus('saved');
        onSaved?.();
        setTimeout(() => setStatus('idle'), 1500);
      } catch (error) {
        setStatus('idle');
        toast.error(error instanceof Error ? error.message : 'Could not save.');
      }
    }, SAVE_DELAY);
    return () => clearTimeout(timer);
  }, [title, content, pinned, noteId, onSaved]);

  const edit = (updater: () => void) => {
    dirty.current = true;
    updater();
  };

  const wrap = (before: string, after = before) => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const selected = content.slice(start, end);
    const next = `${content.slice(0, start)}${before}${selected}${after}${content.slice(end)}`;
    edit(() => setContent(next));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, end + before.length);
    });
  };

  const prefixLine = (prefix: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = content.lastIndexOf('\n', el.selectionStart - 1) + 1;
    const next = `${content.slice(0, start)}${prefix}${content.slice(start)}`;
    edit(() => setContent(next));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(el.selectionStart + prefix.length, el.selectionStart + prefix.length);
    });
  };

  const syncSelection = () => {
    const el = textareaRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    noteBridge.setSelection({
      text: content.slice(selectionStart, selectionEnd),
      start: selectionStart,
      end: selectionEnd,
    });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-6 py-8">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-(--topbar-h) shrink-0 items-center gap-1 border-b border-border px-3">
        <div className="flex items-center gap-0.5">
          <ToolbarButton label="Heading" onClick={() => prefixLine('## ')}>
            <Heading2 />
          </ToolbarButton>
          <ToolbarButton label="Bold" onClick={() => wrap('**')}>
            <Bold />
          </ToolbarButton>
          <ToolbarButton label="Italic" onClick={() => wrap('_')}>
            <Italic />
          </ToolbarButton>
          <ToolbarButton label="Code" onClick={() => wrap('`')}>
            <Code />
          </ToolbarButton>
          <ToolbarButton label="Link" onClick={() => wrap('[', '](url)')}>
            <Link2 />
          </ToolbarButton>
          <span className="mx-1 h-4 w-px bg-border" />
          <ToolbarButton label="List" onClick={() => prefixLine('- ')}>
            <List />
          </ToolbarButton>
          <ToolbarButton label="Checklist" onClick={() => prefixLine('- [ ] ')}>
            <ListChecks />
          </ToolbarButton>
          <ToolbarButton label="Quote" onClick={() => prefixLine('> ')}>
            <Quote />
          </ToolbarButton>
          <ToolbarButton
            label="Table"
            onClick={() =>
              edit(() =>
                setContent(
                  (prev) => `${prev}\n\n| Column | Column |\n| --- | --- |\n|  |  |\n`,
                ),
              )
            }
          >
            <Table />
          </ToolbarButton>
        </div>

        <div className="flex-1" />

        <span className="mr-1 text-2xs text-tertiary">
          {status === 'saving'
            ? 'Saving…'
            : status === 'saved'
              ? 'Saved'
              : data?.note
                ? relativeTime(data.note.updatedAt)
                : ''}
        </span>

        <Segmented
          value={view}
          onValueChange={setView}
          options={[
            { value: 'write', label: 'Write' },
            { value: 'split', label: 'Split' },
            { value: 'read', label: 'Read', icon: <Eye className="size-3" /> },
          ]}
        />

        <Tooltip content={pinned ? 'Unpin' : 'Pin'}>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => edit(() => setPinned((v) => !v))}
            className={cn(pinned && 'text-accent-text')}
            aria-label="Pin note"
          >
            <Pin />
          </Button>
        </Tooltip>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setConfirmDelete(true)}
          aria-label="Delete note"
        >
          <Trash2 />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <div className={cn('grid h-full', view === 'split' ? 'grid-cols-2' : 'grid-cols-1')}>
          {view !== 'read' ? (
            <div className="min-h-0 overflow-y-auto scrollbar-thin">
              <div className="mx-auto max-w-3xl px-6 py-6">
                <input
                  value={title}
                  onChange={(e) => edit(() => setTitle(e.target.value))}
                  placeholder="Untitled"
                  className="mb-3 w-full bg-transparent text-2xl font-medium tracking-tight text-fg outline-none placeholder:text-tertiary"
                />
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => edit(() => setContent(e.target.value))}
                  onSelect={syncSelection}
                  onKeyUp={syncSelection}
                  onBlur={syncSelection}
                  placeholder="Write in Markdown. Select text and use the assistant to rewrite, expand or translate it."
                  spellCheck
                  className="min-h-[60dvh] w-full resize-none bg-transparent font-mono text-sm leading-[1.75] text-fg outline-none placeholder:text-tertiary"
                />
              </div>
            </div>
          ) : null}

          {view !== 'write' ? (
            <div
              className={cn(
                'min-h-0 overflow-y-auto scrollbar-thin',
                view === 'split' && 'border-l border-border bg-bg-subtle',
              )}
            >
              <div className="mx-auto max-w-3xl px-6 py-6">
                <h1 className="mb-3 text-2xl font-medium tracking-tight text-fg">
                  {title || 'Untitled'}
                </h1>
                {content.trim() ? (
                  <Markdown content={content} />
                ) : (
                  <p className="text-sm text-tertiary">Nothing to preview yet.</p>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this note?"
        description="It will be removed from your notes and from search."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          await api.delete(`/api/notes/${noteId}`);
          toast.success('Note deleted');
          onSaved?.();
          router.push('/notes');
        }}
      />
    </div>
  );
}

function ToolbarButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        onClick={onClick}
        className="rounded-sm p-1.5 text-tertiary transition-colors hover:bg-surface-hover hover:text-fg [&_svg]:size-3.5"
        aria-label={label}
      >
        {children}
      </button>
    </Tooltip>
  );
}

