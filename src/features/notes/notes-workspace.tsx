'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { NotebookPen, Pin, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';

import { Page } from '@/components/shell/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Skeleton } from '@/components/ui/primitives';
import { useApi, useDebouncedValue } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { cn, relativeTime } from '@/lib/utils';
import { usePanel } from '@/features/workspace/workspace-context';
import { NoteEditor } from './note-editor';

type NoteRow = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  updatedAt: string;
  projectId: string | null;
  sourceId: string | null;
};

export function NotesWorkspace({
  noteId,
  projectId,
}: {
  noteId?: string;
  projectId?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = React.useState('');
  const debounced = useDebouncedValue(query, 200);
  const creating = React.useRef(false);

  const search = new URLSearchParams();
  if (debounced) search.set('q', debounced);
  if (projectId) search.set('projectId', projectId);

  const { data, loading, refresh } = useApi<{ notes: NoteRow[] }>(
    `/api/notes?${search.toString()}`,
  );

  const current = data?.notes.find((n) => n.id === noteId) ?? null;

  usePanel(
    {
      mode: noteId ? 'writing' : 'chat',
      title: noteId ? 'Writing assistant' : 'Assistant',
      sourceIds: current?.sourceId ? [current.sourceId] : [],
      projectId: projectId ?? null,
      payload: { noteId },
    },
    [noteId, current?.sourceId, projectId],
  );

  const create = React.useCallback(async () => {
    if (creating.current) return;
    creating.current = true;
    try {
      const { note } = await api.post<{ note: NoteRow }>('/api/notes', {
        title: 'Untitled',
        content: '',
        projectId: projectId ?? null,
      });
      refresh();
      router.push(`/notes/${note.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create note.');
    } finally {
      creating.current = false;
    }
  }, [projectId, refresh, router]);

  React.useEffect(() => {
    if (params.get('new') === '1') void create();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return (
    <Page>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-bg-subtle md:flex">
          <div className="flex h-(--topbar-h) shrink-0 items-center gap-2 px-3">
            <span className="text-xs font-medium text-fg">Notes</span>
            <div className="flex-1" />
            <Button variant="ghost" size="icon-xs" onClick={create} aria-label="New note">
              <Plus />
            </Button>
          </div>

          <div className="px-2 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-tertiary" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter notes…"
                inputSize="sm"
                className="pl-8"
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2 scrollbar-thin">
            {loading ? (
              [0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : data?.notes.length ? (
              data.notes.map((note) => (
                <Link
                  key={note.id}
                  href={`/notes/${note.id}`}
                  className={cn(
                    'block rounded-md px-2 py-1.5 transition-colors',
                    note.id === noteId
                      ? 'bg-surface-active'
                      : 'hover:bg-surface-hover',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {note.pinned ? <Pin className="size-2.5 shrink-0 text-tertiary" /> : null}
                    <span
                      className={cn(
                        'min-w-0 flex-1 truncate text-xs',
                        note.id === noteId ? 'font-medium text-fg' : 'text-secondary',
                      )}
                    >
                      {note.title || 'Untitled'}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-2xs text-tertiary">
                    {note.content.replace(/[#*`>\-]/g, '').slice(0, 60) ||
                      relativeTime(note.updatedAt)}
                  </span>
                </Link>
              ))
            ) : (
              <p className="px-2 py-6 text-center text-xs text-tertiary">No notes yet.</p>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {noteId ? (
            <NoteEditor key={noteId} noteId={noteId} onSaved={refresh} />
          ) : (
            <EmptyState
              className="h-full"
              icon={<NotebookPen />}
              title="Select or create a note"
              description="Notes are markdown, indexed into your knowledge base, and editable alongside a writing assistant."
              action={
                <Button variant="primary" size="sm" onClick={create}>
                  <Plus />
                  New note
                </Button>
              }
            />
          )}
        </div>
      </div>
    </Page>
  );
}
