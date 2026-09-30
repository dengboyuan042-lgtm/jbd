'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Blocks,
  ChevronLeft,
  FileText,
  Globe,
  Mic,
  NotebookPen,
  Plus,
  Trash2,
  Youtube,
} from 'lucide-react';
import { toast } from 'sonner';

import { Page, PageBody, PageHeader } from '@/components/shell/page';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import {
  EmptyState,
  ErrorState,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/utils';
import { usePanel } from '@/features/workspace/workspace-context';
import { ToolRunnerDialog } from '@/features/tools/tool-runner-dialog';
import { UploadDialog } from '@/features/library/upload-dialog';
import { MemoryPanel } from '@/features/memory/memory-panel';
import { TaskList } from '@/features/tasks/task-list';

type ProjectData = {
  project: {
    id: string;
    name: string;
    description: string | null;
    goal: string | null;
    updatedAt: string;
  };
  sources: { id: string; title: string; kind: string; summary: string | null; updatedAt: string }[];
  notes: { id: string; title: string; updatedAt: string }[];
  chats: { id: string; title: string; updatedAt: string }[];
  tasks: {
    id: string;
    title: string;
    detail: string | null;
    status: 'open' | 'doing' | 'done';
    priority: 'low' | 'normal' | 'high';
    dueAt: string | null;
  }[];
  memories: {
    id: string;
    key: string;
    value: string;
    kind: string;
    scope: string;
    pinned: boolean;
  }[];
};

const KIND_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  file: FileText,
  note: NotebookPen,
  recording: Mic,
  webpage: Globe,
  youtube: Youtube,
};

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { data, loading, error, refresh } = useApi<ProjectData>(`/api/projects/${projectId}`);
  const [toolOpen, setToolOpen] = React.useState(false);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const sourceIds = React.useMemo(() => data?.sources.map((s) => s.id) ?? [], [data]);

  usePanel(
    {
      mode: 'project',
      title: data?.project.name ? `${data.project.name} agent` : 'Project agent',
      projectId,
      sourceIds,
    },
    [projectId, sourceIds.join(',')],
  );

  if (loading) {
    return (
      <Page>
        <PageHeader title={<Skeleton className="h-4 w-40" />} />
        <PageBody>
          <Skeleton className="h-40 w-full rounded-lg" />
        </PageBody>
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page>
        <ErrorState description={error ?? 'Project not found.'} onRetry={refresh} />
      </Page>
    );
  }

  const { project } = data;

  return (
    <Page>
      <PageHeader
        breadcrumb={
          <Link
            href="/projects"
            className="inline-flex items-center gap-1 text-2xs text-tertiary transition-colors hover:text-fg"
          >
            <ChevronLeft className="size-3" />
            Projects
          </Link>
        }
        title={project.name}
        subtitle={project.description ?? undefined}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setUploadOpen(true)}>
              <Plus />
              Add material
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setToolOpen(true)}
              disabled={!sourceIds.length}
            >
              <Blocks />
              Tools
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete project"
            >
              <Trash2 />
            </Button>
          </>
        }
      />

      <PageBody width="wide">
        {project.goal ? (
          <div className="mb-5 rounded-lg border border-border bg-bg-subtle px-4 py-3">
            <p className="text-2xs font-semibold uppercase tracking-[0.07em] text-tertiary">
              Goal
            </p>
            <p className="mt-1 text-sm text-secondary">{project.goal}</p>
          </div>
        ) : null}

        <Tabs defaultValue="material">
          <TabsList>
            <TabsTrigger value="material">Material ({data.sources.length})</TabsTrigger>
            <TabsTrigger value="notes">Notes ({data.notes.length})</TabsTrigger>
            <TabsTrigger value="tasks">Tasks ({data.tasks.filter((t) => t.status !== 'done').length})</TabsTrigger>
            <TabsTrigger value="memory">Memory ({data.memories.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="material" className="pt-4">
            {data.sources.length ? (
              <div className="overflow-hidden rounded-lg border border-border bg-surface">
                {data.sources.map((source, index) => {
                  const Icon = KIND_ICONS[source.kind] ?? FileText;
                  return (
                    <Link
                      key={source.id}
                      href={`/library/${source.id}`}
                      className={`flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover ${
                        index > 0 ? 'border-t border-border' : ''
                      }`}
                    >
                      <Icon className="size-4 shrink-0 text-tertiary" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-fg">{source.title}</span>
                        {source.summary ? (
                          <span className="block truncate text-xs text-tertiary">
                            {source.summary}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-2xs text-tertiary">
                        {relativeTime(source.updatedAt)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <EmptyState
                compact
                icon={<Plus />}
                title="No material yet"
                description="Add documents, recordings or links to give this project something to work from."
                action={
                  <Button size="sm" variant="primary" onClick={() => setUploadOpen(true)}>
                    Add material
                  </Button>
                }
              />
            )}
          </TabsContent>

          <TabsContent value="notes" className="pt-4">
            {data.notes.length ? (
              <div className="overflow-hidden rounded-lg border border-border bg-surface">
                {data.notes.map((note, index) => (
                  <Link
                    key={note.id}
                    href={`/notes/${note.id}`}
                    className={`flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover ${
                      index > 0 ? 'border-t border-border' : ''
                    }`}
                  >
                    <NotebookPen className="size-4 shrink-0 text-tertiary" />
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">{note.title}</span>
                    <span className="shrink-0 text-2xs text-tertiary">
                      {relativeTime(note.updatedAt)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon={<NotebookPen />}
                title="No notes"
                description="Generated summaries, meeting notes and reports land here."
              />
            )}
          </TabsContent>

          <TabsContent value="tasks" className="pt-4">
            <TaskList projectId={projectId} tasks={data.tasks} onChange={refresh} />
          </TabsContent>

          <TabsContent value="memory" className="pt-4">
            <MemoryPanel
              scope="project"
              projectId={projectId}
              memories={data.memories}
              onChange={refresh}
            />
          </TabsContent>
        </Tabs>
      </PageBody>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        projectId={projectId}
        onDone={refresh}
      />
      <ToolRunnerDialog
        open={toolOpen}
        onOpenChange={setToolOpen}
        sourceIds={sourceIds}
        projectId={projectId}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this project?"
        description="Material stays in your library; the project grouping, tasks and project memory are removed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          await api.delete(`/api/projects/${projectId}`);
          toast.success('Project deleted');
          router.push('/projects');
        }}
      />
    </Page>
  );
}

