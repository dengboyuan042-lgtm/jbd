'use client';

import * as React from 'react';
import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { cn, formatDuration } from '@/lib/utils';

export type Segment = {
  id: string;
  ordinal: number;
  startTime: number;
  endTime: number;
  text: string;
  speakerId: string | null;
};

export type Speaker = {
  id: string;
  label: string;
  displayName: string | null;
  color: string;
};

const SPEAKER_COLORS: Record<string, string> = {
  indigo: 'text-indigo-600 dark:text-indigo-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  rose: 'text-rose-600 dark:text-rose-400',
  sky: 'text-sky-600 dark:text-sky-400',
  violet: 'text-violet-600 dark:text-violet-400',
  slate: 'text-secondary',
};

/** Transcript with playback sync: the active line follows audio, clicks seek. */
export function TranscriptView({
  segments,
  speakers = [],
  currentTime,
  onSeek,
  autoScroll = true,
}: {
  segments: Segment[];
  speakers?: Speaker[];
  currentTime: number;
  onSeek: (time: number) => void;
  autoScroll?: boolean;
}) {
  const [query, setQuery] = React.useState('');
  const activeRef = React.useRef<HTMLButtonElement>(null);
  const [userScrolled, setUserScrolled] = React.useState(false);

  const speakerById = React.useMemo(
    () => new Map(speakers.map((s) => [s.id, s])),
    [speakers],
  );

  const activeIndex = React.useMemo(() => {
    for (let i = segments.length - 1; i >= 0; i--) {
      if (currentTime >= segments[i].startTime) return i;
    }
    return -1;
  }, [segments, currentTime]);

  React.useEffect(() => {
    if (!autoScroll || userScrolled) return;
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeIndex, autoScroll, userScrolled]);

  const filtered = query.trim()
    ? segments.filter((s) => s.text.toLowerCase().includes(query.toLowerCase()))
    : segments;

  let lastSpeaker: string | null = null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-4">
      <div className="sticky top-0 z-10 -mx-1 mb-3 bg-bg/90 px-1 py-1 backdrop-blur">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-tertiary" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transcript…"
            inputSize="sm"
            className="pl-8"
          />
        </div>
      </div>

      <div className="space-y-1" onWheel={() => setUserScrolled(true)}>
        {filtered.map((segment) => {
          const index = segments.indexOf(segment);
          const active = index === activeIndex;
          const speaker = segment.speakerId ? speakerById.get(segment.speakerId) : null;
          const showSpeaker = speaker && speaker.id !== lastSpeaker;
          if (speaker) lastSpeaker = speaker.id;

          return (
            <div key={segment.id}>
              {showSpeaker ? (
                <p
                  className={cn(
                    'mt-3 text-2xs font-semibold uppercase tracking-wide',
                    SPEAKER_COLORS[speaker.color] ?? 'text-secondary',
                  )}
                >
                  {speaker.displayName ?? speaker.label}
                </p>
              ) : null}
              <button
                ref={active ? activeRef : undefined}
                type="button"
                onClick={() => {
                  setUserScrolled(false);
                  onSeek(segment.startTime);
                }}
                className={cn(
                  'group flex w-full scroll-mt-24 gap-3 rounded-md px-2 py-1 text-left transition-colors',
                  active ? 'bg-accent-subtle' : 'hover:bg-surface-hover',
                )}
              >
                <span
                  className={cn(
                    'mt-[3px] shrink-0 font-mono text-2xs tabular-nums',
                    active ? 'text-accent-text' : 'text-tertiary',
                  )}
                >
                  {formatDuration(segment.startTime)}
                </span>
                <span
                  className={cn(
                    'text-sm leading-relaxed',
                    active ? 'text-fg' : 'text-secondary',
                  )}
                >
                  {highlight(segment.text, query)}
                </span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(query)})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="rounded-xs bg-warning-subtle text-fg">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
