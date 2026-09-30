'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Globe, Mic, NotebookPen, Sparkles, Youtube } from 'lucide-react';

import type { Citation } from '@/server/db/schema';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/primitives';
import { cn, formatDuration } from '@/lib/utils';
import { useWorkspace } from '@/features/workspace/workspace-context';

const ICONS = {
  file: FileText,
  note: NotebookPen,
  recording: Mic,
  webpage: Globe,
  youtube: Youtube,
  chat: Sparkles,
} as const;

export function citationLocator(citation: Citation): string | null {
  if (citation.page != null) return `p. ${citation.page}`;
  if (citation.time != null) return formatDuration(citation.time);
  if (citation.section) return citation.section;
  return null;
}

/** Navigate to a citation, preferring an in-page jump when the view supports it. */
export function useCitationNavigation() {
  const router = useRouter();
  const { citationHandler } = useWorkspace();

  return React.useCallback(
    (citation: Citation) => {
      if (citationHandler?.({
        sourceId: citation.sourceId,
        chunkId: citation.chunkId,
        page: citation.page,
        time: citation.time,
        section: citation.section,
      })) {
        return;
      }
      const params = new URLSearchParams();
      if (citation.page != null) params.set('page', String(citation.page));
      if (citation.time != null) params.set('t', String(Math.floor(citation.time)));
      if (citation.chunkId) params.set('chunk', citation.chunkId);
      const query = params.toString();
      router.push(`/library/${citation.sourceId}${query ? `?${query}` : ''}`);
    },
    [citationHandler, router],
  );
}

export function CitationChip({
  index,
  citation,
}: {
  index: number;
  citation: Citation;
}) {
  const navigate = useCitationNavigation();
  const Icon = ICONS[citation.kind] ?? FileText;
  const locator = citationLocator(citation);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="mx-0.5 inline-flex h-4 min-w-4 translate-y-[-1px] items-center justify-center rounded-xs border border-[var(--accent-border)] bg-accent-subtle px-1 align-middle text-2xs font-medium text-accent-text transition-colors hover:bg-accent hover:text-white"
        >
          {index}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <button
          type="button"
          onClick={() => navigate(citation)}
          className="block w-full p-3 text-left transition-colors hover:bg-surface-hover"
        >
          <div className="flex items-center gap-1.5">
            <Icon className="size-3 shrink-0 text-tertiary" />
            <span className="truncate text-xs font-medium text-fg">{citation.title}</span>
            {locator ? (
              <span className="ml-auto shrink-0 rounded-xs bg-bg-sunken px-1 text-2xs text-tertiary">
                {locator}
              </span>
            ) : null}
          </div>
          {citation.snippet ? (
            <p className="mt-1.5 line-clamp-4 text-xs leading-relaxed text-secondary">
              {citation.snippet}
            </p>
          ) : null}
          <p className="mt-2 text-2xs text-accent-text">Open source →</p>
        </button>
      </PopoverContent>
    </Popover>
  );
}

/** Compact source list rendered under an assistant message. */
export function CitationList({
  citations,
  className,
}: {
  citations: Citation[];
  className?: string;
}) {
  const navigate = useCitationNavigation();
  if (!citations.length) return null;

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {citations.map((citation, i) => {
        const Icon = ICONS[citation.kind] ?? FileText;
        const locator = citationLocator(citation);
        return (
          <button
            key={`${citation.sourceId}-${citation.chunkId ?? i}`}
            type="button"
            onClick={() => navigate(citation)}
            className="group inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-surface px-1.5 py-1 text-2xs text-secondary transition-colors hover:border-border-strong hover:text-fg"
          >
            <span className="flex size-3.5 shrink-0 items-center justify-center rounded-xs bg-bg-sunken text-2xs text-tertiary">
              {i + 1}
            </span>
            <Icon className="size-3 shrink-0 text-tertiary" />
            <span className="truncate">{citation.title}</span>
            {locator ? <span className="shrink-0 text-tertiary">· {locator}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
