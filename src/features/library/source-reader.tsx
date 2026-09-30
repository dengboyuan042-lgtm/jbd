'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Blocks,
  ChevronLeft,
  Download,
  ExternalLink,
  FileText,
  ListTree,
  Mic,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Page, PageBody, PageHeader } from '@/components/shell/page';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import {
  EmptyState,
  ErrorState,
  Skeleton,
  Tooltip,
} from '@/components/ui/primitives';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { cn, formatBytes, formatDuration } from '@/lib/utils';
import type { DocumentOutlineItem } from '@/server/db/schema';
import { useWorkspace } from '@/features/workspace/workspace-context';
import { ToolRunnerDialog } from '@/features/tools/tool-runner-dialog';
import { MediaPlayer } from '@/features/media/media-player';
import { TranscriptView } from '@/features/media/transcript-view';
import { PdfViewer } from './pdf-viewer';
import { TextReader } from './text-reader';

type SourceDetail = {
  source: {
    id: string;
    title: string;
    kind: 'file' | 'note' | 'recording' | 'webpage' | 'youtube' | 'chat';
    summary: string | null;
    url: string | null;
    tags: string[];
    projectId: string | null;
    indexedAt: string | null;
    metadata: Record<string, unknown>;
  };
  document: {
    id: string;
    text: string;
    pageCount: number | null;
    wordCount: number;
    outline: DocumentOutlineItem[];
    parser: string;
  } | null;
  chunkCount: number;
  file: { id: string; name: string; mimeType: string; extension: string; size: number } | null;
  fileUrl: string | null;
  recording: { id: string; durationSec: number; waveform: number[] } | null;
  transcript: {
    id: string;
    text: string;
    segments: {
      id: string;
      ordinal: number;
      startTime: number;
      endTime: number;
      text: string;
      speakerId: string | null;
    }[];
  } | null;
  note: { id: string } | null;
};

export function SourceReader({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { setPanel, registerCitationHandler } = useWorkspace();

  const { data, loading, error, refresh } = useApi<SourceDetail>(`/api/sources/${sourceId}`);
  const [toolOpen, setToolOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [outlineOpen, setOutlineOpen] = React.useState(false);
  const [page, setPage] = React.useState<number | null>(
    params.get('page') ? Number(params.get('page')) : null,
  );
  const [seekTo, setSeekTo] = React.useState<number | null>(
    params.get('t') ? Number(params.get('t')) : null,
  );
  const [currentTime, setCurrentTime] = React.useState(0);
  const [highlightChunk, setHighlightChunk] = React.useState<string | null>(
    params.get('chunk'),
  );

  React.useEffect(() => {
    setPanel({
      mode: 'reader',
      title: 'Ask about this',
      sourceIds: [sourceId],
      projectId: data?.source.projectId ?? null,
    });
  }, [setPanel, sourceId, data?.source.projectId]);

  // Let citations jump inside this view instead of navigating away.
  React.useEffect(() => {
    const handler = (target: {
      sourceId: string;
      chunkId?: string;
      page?: number;
      time?: number;
    }) => {
      if (target.sourceId !== sourceId) return false;
      if (target.page != null) setPage(target.page);
      if (target.time != null) setSeekTo(target.time);
      if (target.chunkId) setHighlightChunk(target.chunkId);
      return true;
    };
    registerCitationHandler(handler);
    return () => registerCitationHandler(null);
  }, [registerCitationHandler, sourceId]);

  const remove = async () => {
    await api.delete(`/api/sources/${sourceId}`);
    toast.success('Removed from library');
    router.push('/library');
  };

  if (loading) {
    return (
      <Page>
        <PageHeader title={<Skeleton className="h-4 w-48" />} />
        <PageBody width="narrow">
          <Skeleton className="h-64 w-full rounded-lg" />
        </PageBody>
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page>
        <PageBody>
          <ErrorState description={error ?? 'That source could not be loaded.'} onRetry={refresh} />
        </PageBody>
      </Page>
    );
  }

  const { source, document, file, fileUrl, recording, transcript } = data;
  const isPdf = file?.extension === 'pdf';
  const isMedia =
    source.kind === 'recording' ||
    (file && (file.mimeType.startsWith('audio/') || file.mimeType.startsWith('video/')));

  return (
    <Page>
      <PageHeader
        breadcrumb={
          <Link
            href="/library"
            className="inline-flex items-center gap-1 text-2xs text-tertiary transition-colors hover:text-fg"
          >
            <ChevronLeft className="size-3" />
            Library
          </Link>
        }
        title={source.title}
        subtitle={[
          document?.pageCount ? `${document.pageCount} pages` : null,
          document?.wordCount ? `${document.wordCount.toLocaleString()} words` : null,
          file ? formatBytes(file.size) : null,
          recording?.durationSec ? formatDuration(recording.durationSec) : null,
          data.chunkCount ? `${data.chunkCount} indexed passages` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {document?.outline.length ? (
              <Tooltip content="Outline">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setOutlineOpen((v) => !v)}
                  aria-label="Outline"
                >
                  <ListTree />
                </Button>
              </Tooltip>
            ) : null}
            {source.url ? (
              <Button variant="ghost" size="sm" asChild>
                <a href={source.url} target="_blank" rel="noreferrer">
                  <ExternalLink />
                  Original
                </a>
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={() => setToolOpen(true)}>
              <Blocks />
              Tools
            </Button>
            <Menu>
              <MenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More">
                  <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
                    <circle cx="5" cy="12" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="19" cy="12" r="1.6" />
                  </svg>
                </Button>
              </MenuTrigger>
              <MenuContent>
                {fileUrl ? (
                  <MenuItem
                    icon={<Download />}
                    onSelect={() => window.open(fileUrl, '_blank')}
                  >
                    Download
                  </MenuItem>
                ) : null}
                {isMedia && !transcript ? (
                  <MenuItem
                    icon={<Mic />}
                    onSelect={async () => {
                      try {
                        await api.post('/api/transcribe', {
                          fileId: file?.id,
                          recordingId: recording?.id,
                        });
                        toast.success('Transcript ready');
                        refresh();
                      } catch (err) {
                        toast.error('Transcription unavailable', {
                          description: err instanceof Error ? err.message : undefined,
                        });
                      }
                    }}
                  >
                    Transcribe
                  </MenuItem>
                ) : null}
                <MenuItem icon={<Trash2 />} destructive onSelect={() => setConfirmDelete(true)}>
                  Delete
                </MenuItem>
              </MenuContent>
            </Menu>
          </>
        }
      />

      <div className="flex min-h-0 flex-1">
        {outlineOpen && document?.outline.length ? (
          <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-border bg-bg-subtle p-2 scrollbar-thin lg:block">
            <p className="px-2 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-[0.07em] text-tertiary">
              Outline
            </p>
            {document.outline.map((item, i) => (
              <button
                key={`${item.title}-${i}`}
                type="button"
                onClick={() => item.page && setPage(item.page)}
                className={cn(
                  'block w-full truncate rounded-sm px-2 py-1 text-left text-xs text-secondary transition-colors hover:bg-surface-hover hover:text-fg',
                  item.level === 2 && 'pl-4',
                  item.level >= 3 && 'pl-6',
                )}
              >
                {item.title}
              </button>
            ))}
          </aside>
        ) : null}

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {isMedia ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b border-border px-5 py-3">
                <MediaPlayer
                  src={fileUrl ?? ''}
                  waveform={recording?.waveform ?? []}
                  durationHint={recording?.durationSec ?? 0}
                  seekTo={seekTo}
                  onTime={setCurrentTime}
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
                {transcript?.segments.length ? (
                  <TranscriptView
                    segments={transcript.segments}
                    currentTime={currentTime}
                    onSeek={setSeekTo}
                  />
                ) : (
                  <EmptyState
                    icon={<Mic />}
                    title="No transcript yet"
                    description="Transcribe this recording to make it searchable and citable by timestamp."
                  />
                )}
              </div>
            </div>
          ) : isPdf && fileUrl ? (
            <PdfViewer url={fileUrl} page={page} />
          ) : document ? (
            <TextReader
              sourceId={sourceId}
              page={page}
              onPageChange={setPage}
              highlightChunkId={highlightChunk}
              summary={source.summary}
            />
          ) : (
            <EmptyState
              icon={<FileText />}
              title="Nothing to display"
              description="This item has no extracted text. It is still stored and can be downloaded."
            />
          )}
        </div>
      </div>

      <ToolRunnerDialog
        open={toolOpen}
        onOpenChange={setToolOpen}
        sourceIds={[sourceId]}
        projectId={source.projectId}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this source?"
        description="It will be removed from your library, search index and any projects."
        confirmLabel="Delete"
        destructive
        onConfirm={remove}
      />
    </Page>
  );
}

