'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CircleAlert, Mic, Pause, Play, Square } from 'lucide-react';
import { toast } from 'sonner';

import { Page, PageBody, PageHeader } from '@/components/shell/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Skeleton } from '@/components/ui/primitives';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/menu';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { cn, formatDuration, relativeTime } from '@/lib/utils';
import { usePanel } from '@/features/workspace/workspace-context';
import { Waveform } from '@/features/media/waveform';
import { liveSession } from './live-session-store';
import { useRecorder } from './use-recorder';
import { speechRecognitionSupported, useSpeechRecognition } from './use-speech-recognition';

type RecordingRow = {
  id: string;
  title: string;
  status: string;
  durationSec: number;
  createdAt: string;
};

const LANGUAGES = [
  { value: 'en-US', label: 'English (US)' },
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'es-ES', label: 'Spanish' },
  { value: 'fr-FR', label: 'French' },
  { value: 'de-DE', label: 'German' },
  { value: 'pt-BR', label: 'Portuguese' },
  { value: 'zh-CN', label: 'Chinese' },
  { value: 'ja-JP', label: 'Japanese' },
  { value: 'ko-KR', label: 'Korean' },
];

export function RecordWorkspace() {
  const router = useRouter();
  const params = useSearchParams();
  const { data, loading, refresh } = useApi<{ recordings: RecordingRow[] }>('/api/recordings');

  const [title, setTitle] = React.useState('');
  const [language, setLanguage] = React.useState('en-US');
  const [recordingId, setRecordingId] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const autostarted = React.useRef(false);

  const recorder = useRecorder();
  const speech = useSpeechRecognition({
    language,
    getElapsed: recorder.getElapsed,
  });

  usePanel({ mode: 'live', title: 'Live assistant' }, []);

  /* Mirror capture state into the shared store the live panel reads. */
  React.useEffect(() => {
    liveSession.set({
      recordingId,
      title,
      active: recorder.state === 'recording' || recorder.state === 'paused',
      paused: recorder.state === 'paused',
      elapsed: recorder.elapsed,
      segments: speech.segments,
      interim: speech.interim,
      language,
    });
  }, [
    recordingId,
    title,
    recorder.state,
    recorder.elapsed,
    speech.segments,
    speech.interim,
    language,
  ]);

  React.useEffect(() => () => liveSession.reset(), []);

  const begin = React.useCallback(async () => {
    try {
      const { recording } = await api.post<{ recording: RecordingRow }>('/api/recordings', {
        title: title || undefined,
        language,
      });
      setRecordingId(recording.id);
      setTitle(recording.title);
      speech.reset();
      await recorder.start();
      speech.start();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start recording.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, language]);

  React.useEffect(() => {
    if (params.get('start') === '1' && !autostarted.current) {
      autostarted.current = true;
      void begin();
    }
  }, [params, begin]);

  const finish = async () => {
    if (!recordingId) return;
    setSaving(true);
    speech.stop();
    try {
      const blob = await recorder.stop();
      const duration = recorder.getElapsed();

      if (blob && blob.size) {
        const form = new FormData();
        form.append('audio', blob, 'recording.webm');
        form.append('durationSec', String(duration));
        form.append('waveform', JSON.stringify(recorder.waveform()));
        await api.upload(`/api/recordings/${recordingId}/audio`, form);
      }

      if (title) await api.patch(`/api/recordings/${recordingId}`, { title });

      if (speech.segments.length) {
        await api.post(`/api/recordings/${recordingId}/transcript`, {
          provider: 'browser',
          language,
          durationSec: duration,
          segments: speech.segments.map((s) => ({
            start: s.start,
            end: s.end,
            text: s.text,
            confidence: s.confidence,
          })),
        });
        toast.success('Recording saved and transcribed');
      } else {
        await api.patch(`/api/recordings/${recordingId}`, {
          status: 'ready',
          durationSec: duration,
        });
        toast.warning('Recording saved without a transcript', {
          description: 'No speech was recognised. You can transcribe it later.',
        });
      }

      liveSession.reset();
      refresh();
      router.push(`/record/${recordingId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the recording.');
    } finally {
      setSaving(false);
    }
  };

  const active = recorder.state === 'recording' || recorder.state === 'paused';
  const supported = speechRecognitionSupported();

  return (
    <Page>
      <PageHeader title="Record" subtitle="Capture a meeting, lecture or voice note." />

      <PageBody width="narrow">
        <div className="space-y-6">
          <div
            className={cn(
              'rounded-xl border bg-surface p-5 transition-colors',
              active ? 'border-danger-border' : 'border-border',
            )}
          >
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Session title"
                inputSize="md"
                className="max-w-xs flex-1"
                disabled={saving}
              />
              <Select value={language} onValueChange={setLanguage} disabled={active}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="mt-5">
              <Waveform peaks={recorder.peaks} progress={1} height={64} live />
            </div>

            <div className="mt-4 flex items-center gap-3">
              <span className="font-mono text-2xl tabular-nums tracking-tight text-fg">
                {formatDuration(recorder.elapsed, true)}
              </span>
              {active ? (
                <span className="flex items-center gap-1.5 text-xs text-secondary">
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      recorder.state === 'recording' ? 'animate-pulse bg-danger' : 'bg-tertiary',
                    )}
                  />
                  {recorder.state === 'recording' ? 'Recording' : 'Paused'}
                  {speech.listening ? ' · transcribing' : ''}
                </span>
              ) : null}

              <div className="flex-1" />

              {!active ? (
                <Button variant="primary" size="lg" onClick={begin} disabled={saving}>
                  <Mic />
                  Start recording
                </Button>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => {
                      if (recorder.state === 'recording') {
                        recorder.pause();
                        speech.stop();
                      } else {
                        recorder.resume();
                        speech.start();
                      }
                    }}
                  >
                    {recorder.state === 'recording' ? <Pause /> : <Play />}
                    {recorder.state === 'recording' ? 'Pause' : 'Resume'}
                  </Button>
                  <Button variant="danger" size="lg" onClick={finish} loading={saving}>
                    <Square />
                    Stop & save
                  </Button>
                </>
              )}
            </div>

            {recorder.error ? (
              <p className="mt-3 flex items-start gap-1.5 rounded-md border border-danger-border bg-danger-subtle px-2.5 py-2 text-xs text-danger">
                <CircleAlert className="mt-px size-3.5 shrink-0" />
                {recorder.error}
              </p>
            ) : null}

            {!supported ? (
              <p className="mt-3 rounded-md border border-border bg-bg-sunken px-2.5 py-2 text-xs text-tertiary">
                This browser has no on-device speech recognition, so audio will be saved without a
                live transcript. Chrome, Edge and Safari support it — or configure a hosted
                transcription provider in Settings.
              </p>
            ) : null}
          </div>

          {active || speech.segments.length ? (
            <div className="rounded-xl border border-border bg-surface">
              <div className="border-b border-border px-4 py-2.5">
                <p className="text-xs font-medium text-fg">Live transcript</p>
              </div>
              <div className="max-h-80 space-y-1.5 overflow-y-auto px-4 py-3 scrollbar-thin">
                {speech.segments.map((segment) => (
                  <p key={segment.id} className="flex gap-3 text-sm">
                    <span className="mt-[3px] shrink-0 font-mono text-2xs tabular-nums text-tertiary">
                      {formatDuration(segment.start)}
                    </span>
                    <span className="text-secondary">{segment.text}</span>
                  </p>
                ))}
                {speech.interim ? (
                  <p className="flex gap-3 text-sm">
                    <span className="mt-[3px] shrink-0 font-mono text-2xs tabular-nums text-tertiary">
                      {formatDuration(recorder.elapsed)}
                    </span>
                    <span className="text-tertiary">{speech.interim}</span>
                  </p>
                ) : null}
                {!speech.segments.length && !speech.interim ? (
                  <p className="py-6 text-center text-xs text-tertiary">
                    Waiting for speech…
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <section className="space-y-2">
            <h2 className="text-2xs font-semibold uppercase tracking-[0.07em] text-tertiary">
              Recent recordings
            </h2>
            {loading ? (
              <Skeleton className="h-16 w-full rounded-lg" />
            ) : data?.recordings.length ? (
              <div className="overflow-hidden rounded-lg border border-border bg-surface">
                {data.recordings.map((recording, index) => (
                  <Link
                    key={recording.id}
                    href={`/record/${recording.id}`}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover',
                      index > 0 && 'border-t border-border',
                    )}
                  >
                    <Mic className="size-4 shrink-0 text-tertiary" />
                    <span className="min-w-0 flex-1 truncate text-sm text-fg">
                      {recording.title}
                    </span>
                    {recording.status !== 'ready' ? (
                      <Badge tone="warning">{recording.status}</Badge>
                    ) : null}
                    <span className="shrink-0 font-mono text-2xs tabular-nums text-tertiary">
                      {formatDuration(recording.durationSec)}
                    </span>
                    <span className="w-16 shrink-0 text-right text-2xs text-tertiary">
                      {relativeTime(recording.createdAt)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon={<Mic />}
                title="No recordings yet"
                description="Recordings are transcribed, indexed and turned into notes, action items and study material."
              />
            )}
          </section>
        </div>
      </PageBody>
    </Page>
  );
}
