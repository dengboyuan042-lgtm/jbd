'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, Globe, Mic, NotebookPen, Search, Sparkles, Youtube } from 'lucide-react';

import { Page, PageBody, PageHeader } from '@/components/shell/page';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Segmented, Skeleton } from '@/components/ui/primitives';
import { useApi, useDebouncedValue } from '@/hooks/use-api';
import { cn, formatDuration, relativeTime } from '@/lib/utils';
import { usePanel } from '@/features/workspace/workspace-context';

type Hit = {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceKind: string;
  content: string;
  highlights: string[];
  page: number | null;
  startTime: number | null;
  updatedAt: string;
  score: number;
  semanticScore: number;
  keywordScore: number;
};

type Response = {
  hits: Hit[];
  intent: { applied: string[]; since: string | null } | null;
  tookMs: number;
  counts: { semantic: number; keyword: number };
};

const KIND_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  file: FileText,
  note: NotebookPen,
  recording: Mic,
  webpage: Globe,
  youtube: Youtube,
  chat: Sparkles,
};

const KINDS = ['all', 'file', 'note', 'recording', 'webpage', 'youtube'] as const;

/**
 * Full search surface. Exposes the retrieval mode because hybrid, semantic
 * and keyword genuinely behave differently — useful when a term is rare.
 */
export function SearchWorkspace() {
  const router = useRouter();
  const params = useSearchParams();
  const [query, setQuery] = React.useState(params.get('q') ?? '');
  const [mode, setMode] = React.useState<'hybrid' | 'semantic' | 'keyword'>('hybrid');
  const [kind, setKind] = React.useState<string>('all');
  const debounced = useDebouncedValue(query, 250);

  usePanel({ mode: 'chat', title: 'Assistant' }, []);

  const search = new URLSearchParams();
  search.set('q', debounced);
  search.set('mode', mode);
  search.set('limit', '30');
  search.set('entities', '0');
  if (kind !== 'all') search.set('kind', kind);

  const { data, loading } = useApi<Response>(
    debounced.trim() ? `/api/search?${search.toString()}` : null,
  );

  return (
    <Page>
      <PageHeader title="Search" subtitle="Across every document, transcript, note and page.">
        <div className="mt-3 space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-tertiary" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try: decisions about pricing last month"
              inputSize="lg"
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-md border border-border bg-bg-sunken p-0.5">
              {KINDS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKind(option)}
                  className={cn(
                    'h-6 rounded-sm px-2 text-xs font-medium capitalize transition-colors',
                    kind === option
                      ? 'bg-surface text-fg shadow-xs'
                      : 'text-tertiary hover:text-secondary',
                  )}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="flex-1" />

            <Segmented
              value={mode}
              onValueChange={setMode}
              options={[
                { value: 'hybrid', label: 'Hybrid' },
                { value: 'semantic', label: 'Meaning' },
                { value: 'keyword', label: 'Exact' },
              ]}
            />
          </div>

          {data?.intent?.applied.length ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-2xs text-tertiary">Interpreted as:</span>
              {data.intent.applied.map((filter) => (
                <Badge key={filter} tone="accent">
                  {filter}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </PageHeader>

      <PageBody width="wide">
        {!debounced.trim() ? (
          <EmptyState
            icon={<Search />}
            title="Search your knowledge base"
            description="Hybrid search combines meaning and exact terms, then ranks with reciprocal rank fusion. Natural phrasing like “meetings last week about hiring” is understood."
          />
        ) : loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : !data?.hits.length ? (
          <EmptyState title="No results" description="Try fewer or different words." />
        ) : (
          <>
            <p className="mb-3 text-2xs text-tertiary">
              {data.hits.length} results · {data.tookMs} ms · {data.counts.semantic} semantic,{' '}
              {data.counts.keyword} keyword
            </p>
            <div className="space-y-2">
              {data.hits.map((hit) => {
                const Icon = KIND_ICONS[hit.sourceKind] ?? FileText;
                const locator =
                  hit.page != null
                    ? `p. ${hit.page}`
                    : hit.startTime != null
                      ? formatDuration(hit.startTime)
                      : null;
                return (
                  <button
                    key={hit.chunkId}
                    type="button"
                    onClick={() =>
                      router.push(
                        `/library/${hit.sourceId}?chunk=${hit.chunkId}${
                          hit.page != null
                            ? `&page=${hit.page}`
                            : hit.startTime != null
                              ? `&t=${Math.floor(hit.startTime)}`
                              : ''
                        }`,
                      )
                    }
                    className="block w-full rounded-lg border border-border bg-surface p-3.5 text-left transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-sm"
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="size-3.5 shrink-0 text-tertiary" />
                      <span className="truncate text-xs font-medium text-fg">
                        {hit.sourceTitle}
                      </span>
                      {locator ? (
                        <span className="shrink-0 rounded-xs bg-bg-sunken px-1 text-2xs text-tertiary">
                          {locator}
                        </span>
                      ) : null}
                      <span className="ml-auto shrink-0 text-2xs text-tertiary">
                        {relativeTime(hit.updatedAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-secondary">
                      {hit.highlights.join(' … ')}
                    </p>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </PageBody>
    </Page>
  );
}
