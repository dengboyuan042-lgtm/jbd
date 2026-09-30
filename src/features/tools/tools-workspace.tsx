'use client';

import * as React from 'react';
import * as Icons from 'lucide-react';
import { FileText, Globe, Mic, NotebookPen, Search, Youtube } from 'lucide-react';

import { Page, PageBody, PageHeader } from '@/components/shell/page';
import { Input } from '@/components/ui/input';
import { Checkbox, EmptyState, Skeleton } from '@/components/ui/primitives';
import { useApi, useDebouncedValue } from '@/hooks/use-api';
import { cn, relativeTime } from '@/lib/utils';
import { usePanel } from '@/features/workspace/workspace-context';
import { TOOL_CATALOG, type ToolMeta } from './catalog';
import { ToolRunnerDialog } from './tool-runner-dialog';

type SourceRow = {
  id: string;
  title: string;
  kind: string;
  summary: string | null;
  updatedAt: string;
};

const KIND_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  file: FileText,
  note: NotebookPen,
  recording: Mic,
  webpage: Globe,
  youtube: Youtube,
};

const GROUPS = [
  { id: 'understand', label: 'Understand', hint: 'Make sense of what you already have' },
  { id: 'study', label: 'Study', hint: 'Turn material into practice' },
  { id: 'produce', label: 'Produce', hint: 'Draft something you can send' },
] as const;

/** Tools are context-aware: pick material first, then choose what to make. */
export function ToolsWorkspace() {
  const [query, setQuery] = React.useState('');
  const debounced = useDebouncedValue(query, 200);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [activeTool, setActiveTool] = React.useState<string | null>(null);

  const { data, loading } = useApi<{ sources: SourceRow[] }>(
    `/api/sources?limit=60${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`,
  );

  const selectedIds = React.useMemo(() => [...selected], [selected]);

  usePanel(
    { mode: 'chat', title: 'Assistant', sourceIds: selectedIds },
    [selectedIds.join(',')],
  );

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Page>
      <PageHeader
        title="Tools"
        subtitle="Select material, then choose what to make from it. Everything is saved with citations."
      />

      <PageBody width="wide">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="order-2 space-y-6 lg:order-1">
            {GROUPS.map((group) => (
              <section key={group.id} className="space-y-2">
                <div>
                  <h2 className="text-xs font-medium text-fg">{group.label}</h2>
                  <p className="text-2xs text-tertiary">{group.hint}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {TOOL_CATALOG.filter((t) => t.group === group.id).map((tool) => (
                    <ToolCard
                      key={tool.id}
                      tool={tool}
                      disabled={!selectedIds.length}
                      onRun={() => setActiveTool(tool.id)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          <aside className="order-1 lg:order-2">
            <div className="sticky top-0 space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-2xs font-semibold uppercase tracking-[0.07em] text-tertiary">
                  Material
                </h2>
                {selectedIds.length ? (
                  <>
                    <span className="text-2xs text-accent-text">
                      {selectedIds.length} selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelected(new Set())}
                      className="ml-auto text-2xs text-tertiary hover:text-fg"
                    >
                      Clear
                    </button>
                  </>
                ) : null}
              </div>

              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-tertiary" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find material…"
                  inputSize="sm"
                  className="pl-8"
                />
              </div>

              <div className="max-h-[60dvh] overflow-y-auto rounded-lg border border-border bg-surface scrollbar-thin">
                {loading ? (
                  <div className="space-y-1 p-2">
                    {[0, 1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-8 w-full" />
                    ))}
                  </div>
                ) : data?.sources.length ? (
                  data.sources.map((source, index) => {
                    const Icon = KIND_ICONS[source.kind] ?? FileText;
                    const active = selected.has(source.id);
                    return (
                      <button
                        key={source.id}
                        type="button"
                        onClick={() => toggle(source.id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-2.5 py-2 text-left transition-colors',
                          index > 0 && 'border-t border-border',
                          active ? 'bg-accent-subtle' : 'hover:bg-surface-hover',
                        )}
                      >
                        <Checkbox checked={active} className="pointer-events-none" />
                        <Icon className="size-3.5 shrink-0 text-tertiary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs text-fg">{source.title}</span>
                          <span className="block text-2xs text-tertiary">
                            {relativeTime(source.updatedAt)}
                          </span>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <EmptyState
                    compact
                    title="Nothing to work with"
                    description="Add material to your library first."
                  />
                )}
              </div>
            </div>
          </aside>
        </div>
      </PageBody>

      <ToolRunnerDialog
        open={Boolean(activeTool)}
        onOpenChange={(open) => !open && setActiveTool(null)}
        sourceIds={selectedIds}
        initialTool={activeTool ?? undefined}
      />
    </Page>
  );
}

function ToolCard({
  tool,
  disabled,
  onRun,
}: {
  tool: ToolMeta;
  disabled: boolean;
  onRun: () => void;
}) {
  const Icon = (Icons[tool.icon as keyof typeof Icons] ??
    Icons.Sparkles) as React.ComponentType<{ className?: string }>;
  return (
    <button
      type="button"
      onClick={onRun}
      disabled={disabled}
      className={cn(
        'group flex h-full flex-col items-start rounded-lg border border-border bg-surface p-3 text-left transition-[border-color,box-shadow]',
        disabled
          ? 'cursor-not-allowed opacity-55'
          : 'hover:border-border-strong hover:shadow-sm',
      )}
    >
      <Icon className="mb-2 size-4 text-tertiary" />
      <span className="text-sm font-medium text-fg">{tool.label}</span>
      <span className="mt-0.5 text-xs leading-relaxed text-tertiary">{tool.description}</span>
    </button>
  );
}
