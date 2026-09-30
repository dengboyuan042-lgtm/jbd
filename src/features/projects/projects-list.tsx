'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FolderKanban, Plus } from 'lucide-react';
import { toast } from 'sonner';

import { Page, PageBody, PageHeader } from '@/components/shell/page';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/input';
import { EmptyState, Skeleton } from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/utils';
import { usePanel } from '@/features/workspace/workspace-context';

type ProjectRow = {
  id: string;
  name: string;
  description: string | null;
  goal: string | null;
  updatedAt: string;
  sourceCount: number;
  openTaskCount: number;
};

export function ProjectsList() {
  const router = useRouter();
  const params = useSearchParams();
  const { data, loading, refresh } = useApi<{ projects: ProjectRow[] }>('/api/projects');
  const [open, setOpen] = React.useState(params.get('new') === '1');

  usePanel({ mode: 'chat', title: 'Assistant' }, []);

  return (
    <Page>
      <PageHeader
        title="Projects"
        subtitle="A workspace per topic, with its own material, notes, tasks and memory."
        actions={
          <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
            <Plus />
            New project
          </Button>
        }
      />

      <PageBody width="wide">
        {loading ? (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-lg" />
            ))}
          </div>
        ) : data?.projects.length ? (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {data.projects.map((project) => (
              <Link
                key={project.id}
                href={`/projects/${project.id}`}
                className="group rounded-lg border border-border bg-surface p-4 transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-sm"
              >
                <FolderKanban className="mb-2.5 size-4 text-tertiary" />
                <p className="truncate text-sm font-medium text-fg">{project.name}</p>
                {project.description ? (
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-tertiary">
                    {project.description}
                  </p>
                ) : null}
                <div className="mt-3 flex items-center gap-3 text-2xs text-tertiary">
                  <span>{project.sourceCount} sources</span>
                  {project.openTaskCount ? <span>{project.openTaskCount} open</span> : null}
                  <span className="ml-auto">{relativeTime(project.updatedAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<FolderKanban />}
            title="No projects yet"
            description="Group related material into a project to give the assistant a focused context and its own memory."
            action={
              <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
                <Plus />
                New project
              </Button>
            }
          />
        )}
      </PageBody>

      <NewProjectDialog
        open={open}
        onOpenChange={setOpen}
        onCreated={(id) => {
          refresh();
          router.push(`/projects/${id}`);
        }}
      />
    </Page>
  );
}

function NewProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [goal, setGoal] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setGoal('');
    }
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const { project } = await api.post<{ project: ProjectRow }>('/api/projects', {
        name: name.trim(),
        description: description.trim() || null,
        goal: goal.trim() || null,
      });
      onOpenChange(false);
      onCreated(project.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create project.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>
              Projects scope retrieval, tools and memory to a single body of work.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Thesis research"
                autoFocus
              />
            </Field>
            <Field label="Description" hint="optional">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="What this project covers"
              />
            </Field>
            <Field
              label="Goal"
              hint="optional — the assistant keeps this in mind"
            >
              <Textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                rows={2}
                placeholder="Produce a literature review by the end of term"
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
