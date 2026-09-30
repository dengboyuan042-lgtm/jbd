'use client';

import * as React from 'react';

import { EmptyState, Skeleton } from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { cn, formatDuration } from '@/lib/utils';

type Chunk = {
  id: string;
  ordinal: number;
  content: string;
  page: number | null;
  heading: string | null;
  startTime: number | null;
};

/**
 * Renders the indexed passages themselves rather than a re-flowed copy of the
 * document. What the reader sees is exactly what retrieval sees, so a citation
 * always lands on the text that produced it.
 */
export function TextReader({
  sourceId,
  page,
  onPageChange,
  highlightChunkId,
  summary,
}: {
  sourceId: string;
  page: number | null;
  onPageChange?: (page: number) => void;
  highlightChunkId?: string | null;
  summary?: string | null;
}) {
  const { data, loading } = useApi<{ chunks: Chunk[] }>(
    `/api/sources/${sourceId}/chunks?limit=500`,
  );
  const containerRef = React.useRef<HTMLDivElement>(null);

  const chunks = data?.chunks ?? [];

  React.useEffect(() => {
    if (!highlightChunkId && page == null) return;
    const selector = highlightChunkId
      ? `[data-chunk="${highlightChunkId}"]`
      : `[data-page="${page}"]`;
    const el = containerRef.current?.querySelector(selector);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightChunkId, page, chunks.length]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-5 py-6">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (!chunks.length) {
    return (
      <EmptyState
        title="No indexed text"
        description="This source has no extracted passages yet."
      />
    );
  }

  let lastPage: number | null = null;

  return (
    <div ref={containerRef} className="h-full overflow-y-auto scrollbar-thin">
      <div className="mx-auto max-w-3xl px-5 py-6">
        {summary ? (
          <div className="mb-6 rounded-lg border border-border bg-bg-subtle px-4 py-3">
            <p className="mb-1 text-2xs font-semibold uppercase tracking-[0.07em] text-tertiary">
              Summary
            </p>
            <p className="text-sm leading-relaxed text-secondary">{summary}</p>
          </div>
        ) : null}

        <div className="space-y-4">
          {chunks.map((chunk) => {
            const showPage = chunk.page != null && chunk.page !== lastPage;
            if (chunk.page != null) lastPage = chunk.page;
            const highlighted = highlightChunkId === chunk.id;

            return (
              <React.Fragment key={chunk.id}>
                {showPage ? (
                  <div
                    data-page={chunk.page}
                    className="flex items-center gap-3 pt-2"
                    onClick={() => chunk.page && onPageChange?.(chunk.page)}
                  >
                    <span className="text-2xs font-medium uppercase tracking-wide text-tertiary">
                      {chunk.heading ?? `Page ${chunk.page}`}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                ) : null}
                <p
                  data-chunk={chunk.id}
                  className={cn(
                    'scroll-mt-24 rounded-md text-sm leading-[1.75] text-secondary transition-colors',
                    highlighted && 'bg-accent-subtle px-2 py-1 text-fg ring-1 ring-[var(--accent-border)]',
                  )}
                >
                  {chunk.startTime != null ? (
                    <span className="mr-2 font-mono text-2xs tabular-nums text-tertiary">
                      {formatDuration(chunk.startTime)}
                    </span>
                  ) : null}
                  {chunk.content}
                </p>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
