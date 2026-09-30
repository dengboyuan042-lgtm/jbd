'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import * as Icons from 'lucide-react';
import { toast } from 'sonner';

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/menu';
import { Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { TOOL_CATALOG, type ToolMeta } from './catalog';

type RunResult = {
  tool: string;
  output: string;
  title: string;
  noteId?: string;
  deckId?: string;
  quizId?: string;
  mindMapId?: string;
  counts?: Record<string, number>;
};

const GROUPS = [
  { id: 'understand', label: 'Understand' },
  { id: 'study', label: 'Study' },
  { id: 'produce', label: 'Produce' },
] as const;

export function ToolRunnerDialog({
  open,
  onOpenChange,
  sourceIds,
  projectId,
  initialTool,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceIds: string[];
  projectId?: string | null;
  initialTool?: string;
}) {
  const router = useRouter();
  const [toolId, setToolId] = React.useState(initialTool ?? 'summary');
  const [count, setCount] = React.useState('12');
  const [difficulty, setDifficulty] = React.useState('medium');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (open && initialTool) setToolId(initialTool);
  }, [open, initialTool]);

  const tool = TOOL_CATALOG.find((t) => t.id === toolId);
  const needsCount = toolId === 'flashcards' || toolId === 'quiz';

  const run = async () => {
    if (!sourceIds.length) {
      toast.error('Select at least one source first.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.post<RunResult>('/api/tools/run', {
        toolId,
        sourceIds,
        projectId: projectId ?? null,
        options: needsCount
          ? { count: Number(count), ...(toolId === 'quiz' ? { difficulty } : {}) }
          : undefined,
      });

      const href =
        result.noteId
          ? `/notes/${result.noteId}`
          : result.deckId
            ? `/study/decks/${result.deckId}`
            : result.quizId
              ? `/study/quizzes/${result.quizId}`
              : result.mindMapId
                ? `/study/maps/${result.mindMapId}`
                : '/tasks';

      toast.success(result.title, {
        description: describe(result),
        action: { label: 'Open', onClick: () => router.push(href) },
      });
      onOpenChange(false);
      router.push(href);
    } catch (error) {
      toast.error('Could not run that tool', {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Run a tool</DialogTitle>
          <DialogDescription>
            {sourceIds.length
              ? `Across ${sourceIds.length} selected source${sourceIds.length === 1 ? '' : 's'}. Output is saved to your workspace with citations back to the material.`
              : 'Select sources first — tools always run against your own material.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="max-h-[50dvh] overflow-y-auto scrollbar-thin">
          {GROUPS.map((group) => (
            <div key={group.id} className="mb-3">
              <p className="mb-1.5 text-2xs font-semibold uppercase tracking-[0.07em] text-tertiary">
                {group.label}
              </p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {TOOL_CATALOG.filter((t) => t.group === group.id).map((entry) => (
                  <ToolOption
                    key={entry.id}
                    tool={entry}
                    active={toolId === entry.id}
                    onSelect={() => setToolId(entry.id)}
                  />
                ))}
              </div>
            </div>
          ))}

          {needsCount ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-bg-subtle px-3 py-2.5">
              <label className="flex items-center gap-2 text-xs text-secondary">
                How many
                <Select value={count} onValueChange={setCount}>
                  <SelectTrigger size="sm" className="w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {['6', '10', '12', '16', '20', '30'].map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              {toolId === 'quiz' ? (
                <label className="flex items-center gap-2 text-xs text-secondary">
                  Difficulty
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger size="sm" className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['easy', 'medium', 'hard', 'mixed'].map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
              ) : null}
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <span className="mr-auto text-xs text-tertiary">
            {tool ? tool.description : null}
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" onClick={run} disabled={!sourceIds.length || busy}>
            {busy ? <Spinner className="size-3.5" /> : null}
            Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToolOption({
  tool,
  active,
  onSelect,
}: {
  tool: ToolMeta;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = (Icons[tool.icon as keyof typeof Icons] ??
    Icons.Sparkles) as React.ComponentType<{ className?: string }>;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex items-start gap-2.5 rounded-md border px-2.5 py-2 text-left transition-colors',
        active
          ? 'border-accent bg-accent-subtle'
          : 'border-border bg-surface hover:border-border-strong',
      )}
    >
      <Icon className={cn('mt-0.5 size-3.5 shrink-0', active ? 'text-accent-text' : 'text-tertiary')} />
      <span className="min-w-0">
        <span className={cn('block text-xs font-medium', active ? 'text-accent-text' : 'text-fg')}>
          {tool.label}
        </span>
        <span className="block truncate text-2xs text-tertiary">{tool.description}</span>
      </span>
    </button>
  );
}

function describe(result: RunResult): string {
  if (result.counts?.cards) return `${result.counts.cards} cards`;
  if (result.counts?.questions) return `${result.counts.questions} questions`;
  if (result.counts?.nodes) return `${result.counts.nodes} nodes`;
  if (result.counts?.tasks) return `${result.counts.tasks} tasks added`;
  return 'Saved to your workspace';
}
