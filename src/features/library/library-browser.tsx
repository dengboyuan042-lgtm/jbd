'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowDownUp,
  Blocks,
  FileText,
  Globe,
  LayoutGrid,
  Library as LibraryIcon,
  Link2,
  List,
  Mic,
  NotebookPen,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Youtube,
} from 'lucide-react';
import { toast } from 'sonner';

import { Page, PageBody, PageHeader } from '@/components/shell/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/dialog';
import {
  Badge,
  Checkbox,
  EmptyState,
  Segmented,
  Skeleton,
} from '@/components/ui/primitives';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuTrigger,
} from '@/components/ui/menu';
import { useApi, useDebouncedValue, useLocalState } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { cn, formatBytes, relativeTime } from '@/lib/utils';
import { usePanel } from '@/features/workspace/workspace-context';
import { ToolRunnerDialog } from '@/features/tools/tool-runner-dialog';
import { ImportDialog } from './import-dialog';
import { UploadDialog } from './upload-dialog';

type SourceRow = {
  id: string;
  title: string;
  kind: 'file' | 'note' | 'recording' | 'webpage' | 'youtube' | 'chat';
  summary: string | null;
  tags: string[];
  projectId: string | null;
  updatedAt: string;
  indexedAt: string | null;
  metadata: Record<string, unknown>;
  file: { size: number; extension: string; status: string } | null;
};

const KINDS = [
  { value: 'all', label: 'All' },
  { value: 'file', label: 'Files' },
  { value: 'recording', label: 'Recordings' },
  { value: 'note', label: 'Notes' },
  { value: 'webpage', label: 'Web' },
  { value: 'youtube', label: 'Video' },
] as const;

const KIND_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  file: FileText,
  note: NotebookPen,
  recording: Mic,
  webpage: Globe,
  youtube: Youtube,
  chat: Sparkles,
};

export function LibraryBrowser({ projectId }: { projectId?: string }) {
  const router = useRouter();
  const params = useSearchParams();

  const [query, setQuery] = React.useState('');
  const debounced = useDebouncedValue(query, 200);
  const [kind, setKind] = React.useState<string>('all');
  const [sort, setSort] = React.useState<'recent' | 'created' | 'title'>('recent');
  const [view, setView] = useLocalState<'list' | 'grid'>('ui.library.view', 'list');
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [uploadOpen, setUploadOpen] = React.useState(params.get('upload') === '1');
  const [importOpen, setImportOpen] = React.useState(params.get('import') === '1');
  const [toolOpen, setToolOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const search = new URLSearchParams();
  if (debounced) search.set('q', debounced);
  if (kind !== 'all') search.set('kind', kind);
  search.set('sort', sort);
  if (projectId) search.set('projectId', projectId);

  const { data, loading, refresh } = useApi<{ sources: SourceRow[]; total: number }>(
    `/api/sources?${search.toString()}`,
  );

  const selectedIds = React.useMemo(() => [...selected], [selected]);

  usePanel(
    {
      mode: 'chat',
      title: selectedIds.length ? `${selectedIds.length} selected` : 'Assistant',
      sourceIds: selectedIds,
      projectId: projectId ?? null,
    },
    [selectedIds.join(','), projectId],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const removeSelected = async () => {
    await Promise.all(selectedIds.map((id) => api.delete(`/api/sources/${id}`)));
    toast.success(`Removed ${selectedIds.length} item${selectedIds.length === 1 ? '' : 's'}`);
    setSelected(new Set());
    refresh();
  };

  const sources = data?.sources ?? [];

  return (
    <Page>
      <PageHeader
        title={projectId ? undefined : 'Library'}
        subtitle={
          projectId
            ? undefined
            : data
              ? `${data.total} item${data.total === 1 ? '' : 's'}`
              : undefined
        }
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              <Link2 />
              Import
            </Button>
            <Button variant="primary" size="sm" onClick={() => setUploadOpen(true)}>
              <Upload />
              Upload
            </Button>
          </>
        }
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-tertiary" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by name…"
              className="pl-8"
              inputSize="sm"
            />
          </div>

          <div className="flex items-center gap-0.5 rounded-md border border-border bg-bg-sunken p-0.5">
            {KINDS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setKind(option.value)}
                className={cn(
                  'h-6 rounded-sm px-2 text-xs font-medium transition-colors',
                  kind === option.value
                    ? 'bg-surface text-fg shadow-xs'
                    : 'text-tertiary hover:text-secondary',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <Menu>
            <MenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <ArrowDownUp />
                {sort === 'recent' ? 'Recent' : sort === 'created' ? 'Added' : 'Name'}
              </Button>
            </MenuTrigger>
            <MenuContent>
              <MenuLabel>Sort by</MenuLabel>
              <MenuItem onSelect={() => setSort('recent')}>Last updated</MenuItem>
              <MenuItem onSelect={() => setSort('created')}>Date added</MenuItem>
              <MenuItem onSelect={() => setSort('title')}>Name</MenuItem>
            </MenuContent>
          </Menu>

          <Segmented
            value={view}
            onValueChange={setView}
            options={[
              { value: 'list', label: '', icon: <List className="size-3.5" /> },
              { value: 'grid', label: '', icon: <LayoutGrid className="size-3.5" /> },
            ]}
          />
        </div>

        {selectedIds.length ? (
          <div className="mt-2.5 flex items-center gap-2 rounded-md border border-border bg-bg-subtle px-2.5 py-1.5 animate-fade-in">
            <span className="text-xs text-secondary">{selectedIds.length} selected</span>
            <div className="flex-1" />
            <Button size="xs" variant="secondary" onClick={() => setToolOpen(true)}>
              <Blocks />
              Run a tool
            </Button>
            <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
            <Button size="xs" variant="danger" onClick={() => setConfirmDelete(true)}>
              <Trash2 />
              Delete
            </Button>
          </div>
        ) : null}
      </PageHeader>

      <PageBody width="wide">
        {loading ? (
          <div className="space-y-1.5">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : !sources.length ? (
          <EmptyState
            icon={<LibraryIcon />}
            title={query ? 'No matches' : 'Nothing here yet'}
            description={
              query
                ? 'Try a different name, or search content instead with ⌘K.'
                : 'Upload documents, import links or record a session. Everything you add becomes searchable and citable.'
            }
            action={
              query ? null : (
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => setUploadOpen(true)}>
                    <Upload />
                    Upload files
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>
                    <Link2 />
                    Import a link
                  </Button>
                </div>
              )
            }
          />
        ) : view === 'list' ? (
          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            {sources.map((source, index) => (
              <Row
                key={source.id}
                source={source}
                selected={selected.has(source.id)}
                onToggle={() => toggle(source.id)}
                onOpen={() => router.push(`/library/${source.id}`)}
                first={index === 0}
              />
            ))}
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map((source) => (
              <GridCard
                key={source.id}
                source={source}
                selected={selected.has(source.id)}
                onToggle={() => toggle(source.id)}
              />
            ))}
          </div>
        )}
      </PageBody>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        projectId={projectId}
        onDone={refresh}
      />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        projectId={projectId}
        onDone={refresh}
      />
      <ToolRunnerDialog
        open={toolOpen}
        onOpenChange={setToolOpen}
        sourceIds={selectedIds}
        projectId={projectId ?? null}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${selectedIds.length} item${selectedIds.length === 1 ? '' : 's'}?`}
        description="They will be removed from your library and from search. This can't be undone from the interface."
        confirmLabel="Delete"
        destructive
        onConfirm={removeSelected}
      />
    </Page>
  );
}

function Row({
  source,
  selected,
  onToggle,
  onOpen,
  first,
}: {
  source: SourceRow;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  first: boolean;
}) {
  const Icon = KIND_ICONS[source.kind] ?? FileText;
  return (
    <div
      className={cn(
        'group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover',
        !first && 'border-t border-border',
        selected && 'bg-accent-subtle/60',
      )}
    >
      <div
        className={cn(
          'shrink-0 transition-opacity',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <Checkbox checked={selected} onCheckedChange={onToggle} />
      </div>
      <Icon className="size-4 shrink-0 text-tertiary" />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm text-fg">{source.title}</span>
        {source.summary ? (
          <span className="block truncate text-xs text-tertiary">{source.summary}</span>
        ) : null}
      </button>
      {!source.indexedAt ? <Badge tone="warning">Not indexed</Badge> : null}
      {source.file ? (
        <span className="hidden shrink-0 text-2xs uppercase text-tertiary sm:block">
          {source.file.extension}
        </span>
      ) : null}
      {source.file ? (
        <span className="hidden w-16 shrink-0 text-right text-2xs text-tertiary md:block">
          {formatBytes(source.file.size)}
        </span>
      ) : null}
      <span className="w-16 shrink-0 text-right text-2xs text-tertiary">
        {relativeTime(source.updatedAt)}
      </span>
    </div>
  );
}

function GridCard({
  source,
  selected,
  onToggle,
}: {
  source: SourceRow;
  selected: boolean;
  onToggle: () => void;
}) {
  const Icon = KIND_ICONS[source.kind] ?? FileText;
  return (
    <div
      className={cn(
        'group relative rounded-lg border bg-surface p-3 transition-[border-color,box-shadow]',
        selected ? 'border-accent shadow-sm' : 'border-border hover:border-border-strong',
      )}
    >
      <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 data-[on=true]:opacity-100" data-on={selected}>
        <Checkbox checked={selected} onCheckedChange={onToggle} />
      </div>
      <Link href={`/library/${source.id}`} className="block">
        <Icon className="mb-2 size-4 text-tertiary" />
        <p className="line-clamp-2 text-sm font-medium text-fg">{source.title}</p>
        {source.summary ? (
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-tertiary">
            {source.summary}
          </p>
        ) : null}
        <p className="mt-2.5 text-2xs text-tertiary">{relativeTime(source.updatedAt)}</p>
      </Link>
    </div>
  );
}

