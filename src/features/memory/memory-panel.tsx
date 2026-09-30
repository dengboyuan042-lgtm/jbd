'use client';

import * as React from 'react';
import { Brain, Check, Pencil, Pin, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Badge, EmptyState } from '@/components/ui/primitives';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/menu';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export type MemoryRow = {
  id: string;
  key: string;
  value: string;
  kind: string;
  scope: string;
  pinned: boolean;
};

const KINDS = ['fact', 'preference', 'goal', 'person', 'concept', 'decision'];

/**
 * Memory is explicit and editable. Everything the assistant is told to
 * remember is listed here and can be changed or deleted — nothing is hidden.
 */
export function MemoryPanel({
  scope,
  projectId,
  memories,
  onChange,
}: {
  scope: 'user' | 'project';
  projectId?: string | null;
  memories: MemoryRow[];
  onChange: () => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="text-xs text-tertiary">
          {scope === 'user'
            ? 'Facts the assistant keeps in mind across your whole workspace.'
            : 'Facts scoped to this project only.'}
        </p>
        <div className="flex-1" />
        <Button variant="secondary" size="xs" onClick={() => setAdding(true)}>
          <Plus />
          Add
        </Button>
      </div>

      {adding ? (
        <MemoryForm
          scope={scope}
          projectId={projectId}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            onChange();
          }}
        />
      ) : null}

      {!memories.length && !adding ? (
        <EmptyState
          compact
          icon={<Brain />}
          title="No memories yet"
          description="Add a preference, goal or fact and it will be included in every relevant conversation."
        />
      ) : (
        <div className="space-y-1.5">
          {memories.map((memory) =>
            editingId === memory.id ? (
              <MemoryForm
                key={memory.id}
                scope={scope}
                projectId={projectId}
                memory={memory}
                onCancel={() => setEditingId(null)}
                onSaved={() => {
                  setEditingId(null);
                  onChange();
                }}
              />
            ) : (
              <div
                key={memory.id}
                className="group flex items-start gap-3 rounded-lg border border-border bg-surface px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {memory.pinned ? <Pin className="size-2.5 text-accent-text" /> : null}
                    <span className="truncate text-xs font-medium text-fg">{memory.key}</span>
                    <Badge>{memory.kind}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-secondary">{memory.value}</p>
                </div>
                <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={async () => {
                      await api.patch(`/api/memories/${memory.id}`, { pinned: !memory.pinned });
                      onChange();
                    }}
                    className={cn(
                      'rounded-sm p-1 transition-colors hover:bg-surface-hover',
                      memory.pinned ? 'text-accent-text' : 'text-tertiary hover:text-fg',
                    )}
                    aria-label="Pin memory"
                  >
                    <Pin className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(memory.id)}
                    className="rounded-sm p-1 text-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
                    aria-label="Edit memory"
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await api.delete(`/api/memories/${memory.id}`);
                      toast.success('Memory removed');
                      onChange();
                    }}
                    className="rounded-sm p-1 text-tertiary transition-colors hover:bg-surface-hover hover:text-danger"
                    aria-label="Delete memory"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function MemoryForm({
  scope,
  projectId,
  memory,
  onCancel,
  onSaved,
}: {
  scope: 'user' | 'project';
  projectId?: string | null;
  memory?: MemoryRow;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [key, setKey] = React.useState(memory?.key ?? '');
  const [value, setValue] = React.useState(memory?.value ?? '');
  const [kind, setKind] = React.useState(memory?.kind ?? 'fact');
  const [busy, setBusy] = React.useState(false);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!key.trim() || !value.trim()) return;
    setBusy(true);
    try {
      if (memory) {
        await api.patch(`/api/memories/${memory.id}`, { key, value, kind });
      } else {
        await api.post('/api/memories', {
          scope,
          projectId: projectId ?? null,
          key,
          value,
          kind,
        });
      }
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={save}
      className="space-y-2 rounded-lg border border-accent bg-accent-subtle/40 px-3 py-2.5"
    >
      <div className="flex gap-2">
        <Input
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="Label (e.g. Writing style)"
          inputSize="sm"
          autoFocus
        />
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger size="sm" className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="What should be remembered"
      />
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="xs" onClick={onCancel}>
          <X />
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="xs" loading={busy}>
          <Check />
          Save
        </Button>
      </div>
    </form>
  );
}
