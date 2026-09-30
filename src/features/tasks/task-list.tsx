'use client';

import * as React from 'react';
import { Plus, SquareCheckBig, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox, EmptyState } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export type TaskRow = {
  id: string;
  title: string;
  detail: string | null;
  status: 'open' | 'doing' | 'done';
  priority: 'low' | 'normal' | 'high';
  dueAt: string | null;
};

export function TaskList({
  tasks,
  projectId,
  onChange,
  showComposer = true,
}: {
  tasks: TaskRow[];
  projectId?: string | null;
  onChange: () => void;
  showComposer?: boolean;
}) {
  const [title, setTitle] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.post('/api/tasks', { title: title.trim(), projectId: projectId ?? null });
      setTitle('');
      onChange();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not add task.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (task: TaskRow) => {
    await api.patch(`/api/tasks/${task.id}`, {
      status: task.status === 'done' ? 'open' : 'done',
    });
    onChange();
  };

  const remove = async (task: TaskRow) => {
    await api.delete(`/api/tasks/${task.id}`);
    onChange();
  };

  const open = tasks.filter((t) => t.status !== 'done');
  const done = tasks.filter((t) => t.status === 'done');

  return (
    <div className="space-y-3">
      {showComposer ? (
        <form onSubmit={add} className="flex gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task…"
            inputSize="sm"
          />
          <Button type="submit" variant="secondary" size="sm" loading={busy} disabled={!title.trim()}>
            <Plus />
            Add
          </Button>
        </form>
      ) : null}

      {!tasks.length ? (
        <EmptyState
          compact
          icon={<SquareCheckBig />}
          title="Nothing to do"
          description="Action items extracted from meetings and documents appear here automatically."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {[...open, ...done].map((task, index) => (
            <div
              key={task.id}
              className={cn(
                'group flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover',
                index > 0 && 'border-t border-border',
              )}
            >
              <div className="pt-0.5">
                <Checkbox checked={task.status === 'done'} onCheckedChange={() => toggle(task)} />
              </div>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    'text-sm',
                    task.status === 'done' ? 'text-tertiary line-through' : 'text-fg',
                  )}
                >
                  {task.title}
                </p>
                {task.detail ? (
                  <p className="mt-0.5 text-xs text-tertiary">{task.detail}</p>
                ) : null}
              </div>
              {task.dueAt ? (
                <span
                  className={cn(
                    'shrink-0 text-2xs',
                    new Date(task.dueAt) < new Date() && task.status !== 'done'
                      ? 'text-danger'
                      : 'text-tertiary',
                  )}
                >
                  {new Date(task.dueAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => remove(task)}
                className="shrink-0 rounded-sm p-1 text-tertiary opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                aria-label="Delete task"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
