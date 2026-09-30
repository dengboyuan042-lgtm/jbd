'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Blocks, ChevronLeft, Mic, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Page, PageHeader } from '@/components/shell/page';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Badge, EmptyState, ErrorState, Skeleton } from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { formatDuration } from '@/lib/utils';
import { usePanel } from '@/features/workspace/workspace-context';
import { MediaPlayer } from '@/features/media/media-player';
import { TranscriptView, type Segment, type Speaker } from '@/features/media/transcript-view';
import { ToolRunnerDialog } from '@/features/tools/tool-runner-dialog';

type RecordingDetailData = {
  recording: {
    id: string;
    title: string;
    status: string;
    durationSec: number;
    waveform: number[];
    sourceId: string | null;
    language: string | null;
    projectId: string | null;
  };
  transcript: { id: string; text: string; provider: string } | null;
  segments: Segment[];
  speakers: Speaker[];
  audioUrl: string | null;
};

export function RecordingDetail({ recordingId }: { recordingId: string }) {
  const router = useRouter();
  const { data, loading, error, refresh } = useApi<RecordingDetailData>(
    `/api/recordings/${recordingId}`,
  );
  const [time, setTime] = React.useState(0);
  const [seekTo, setSeekTo] = React.useState<number | null>(null);
  const [toolOpen, setToolOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [transcribing, setTranscribing] = React.useState(false);

  usePanel(
    {
      mode: 'chat',
      title: 'Ask about this session',
      sourceIds: data?.recording.sourceId ? [data.recording.sourceId] : [],
      projectId: data?.recording.projectId ?? null,
    },
    [data?.recording.sourceId, data?.recording.projectId],
  );

  if (loading) {
    return (
      <Page>
        <PageHeader title={<Skeleton className="h-4 w-40" />} />
        <div className="p-5">
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      </Page>
    );
  }

  if (error || !data) {
    return (
      <Page>
        <ErrorState description={error ?? 'Recording not found.'} onRetry={refresh} />
      </Page>
    );
  }

  const { recording, segments, speakers, audioUrl, transcript } = data;

  return (
    <Page>
      <PageHeader
        breadcrumb={
          <Link
            href="/record"
            className="inline-flex items-center gap-1 text-2xs text-tertiary transition-colors hover:text-fg"
          >
            <ChevronLeft className="size-3" />
            Record
          </Link>
        }
        title={recording.title}
        subtitle={[
          formatDuration(recording.durationSec),
          transcript ? `${segments.length} segments` : 'No transcript',
          speakers.length ? `${speakers.length} speakers` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {!transcript ? (
              <Button
                variant="secondary"
                size="sm"
                loading={transcribing}
                onClick={async () => {
                  setTranscribing(true);
                  try {
                    await api.post('/api/transcribe', { recordingId });
                    toast.success('Transcript ready');
                    refresh();
                  } catch (err) {
                    toast.error('Transcription unavailable', {
                      description: err instanceof Error ? err.message : undefined,
                    });
                  } finally {
                    setTranscribing(false);
                  }
                }}
              >
                <Mic />
                Transcribe
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setToolOpen(true)}
              disabled={!recording.sourceId}
            >
              <Blocks />
              Tools
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete recording"
            >
              <Trash2 />
            </Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col">
        {audioUrl ? (
          <div className="shrink-0 border-b border-border px-5 py-3">
            <MediaPlayer
              src={audioUrl}
              waveform={recording.waveform}
              durationHint={recording.durationSec}
              seekTo={seekTo}
              onTime={setTime}
            />
          </div>
        ) : (
          <div className="shrink-0 border-b border-border px-5 py-3">
            <Badge tone="warning">Audio was not stored for this session</Badge>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          {segments.length ? (
            <TranscriptView
              segments={segments}
              speakers={speakers}
              currentTime={time}
              onSeek={setSeekTo}
            />
          ) : (
            <EmptyState
              icon={<Mic />}
              title="No transcript"
              description="Transcribe this recording to make it searchable, citable and usable by the study tools."
            />
          )}
        </div>
      </div>

      {recording.sourceId ? (
        <ToolRunnerDialog
          open={toolOpen}
          onOpenChange={setToolOpen}
          sourceIds={[recording.sourceId]}
          projectId={recording.projectId}
          initialTool="meeting-notes"
        />
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this recording?"
        description="The audio, transcript and index entries will be removed."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          await api.delete(`/api/recordings/${recordingId}`);
          toast.success('Recording deleted');
          router.push('/record');
        }}
      />
    </Page>
  );
}
