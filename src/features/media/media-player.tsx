'use client';

import * as React from 'react';
import { Pause, Play, Rewind, Volume2, VolumeX } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Slider, Tooltip } from '@/components/ui/primitives';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/menu';
import { cn, formatDuration } from '@/lib/utils';
import { Waveform } from './waveform';

const SPEEDS = ['0.75', '1', '1.25', '1.5', '1.75', '2'];

export function MediaPlayer({
  src,
  waveform,
  durationHint,
  seekTo,
  onTime,
  compact,
}: {
  src: string;
  waveform?: number[];
  durationHint?: number;
  seekTo?: number | null;
  onTime?: (time: number) => void;
  compact?: boolean;
}) {
  const audioRef = React.useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = React.useState(false);
  const [time, setTime] = React.useState(0);
  const [duration, setDuration] = React.useState(durationHint ?? 0);
  const [volume, setVolume] = React.useState(1);
  const [muted, setMuted] = React.useState(false);
  const [speed, setSpeed] = React.useState('1');
  const [peaks, setPeaks] = React.useState<number[]>(waveform ?? []);

  React.useEffect(() => {
    if (seekTo == null) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = seekTo;
    setTime(seekTo);
    void audio.play().then(() => setPlaying(true)).catch(() => undefined);
  }, [seekTo]);

  React.useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.playbackRate = Number(speed);
  }, [speed]);

  // Decode peaks for the scrubber when the recorder did not supply them.
  React.useEffect(() => {
    if (peaks.length || !src) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(src);
        const buffer = await response.arrayBuffer();
        const ctx = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        const decoded = await ctx.decodeAudioData(buffer);
        const channel = decoded.getChannelData(0);
        const buckets = 240;
        const size = Math.floor(channel.length / buckets) || 1;
        const result: number[] = [];
        for (let i = 0; i < buckets; i++) {
          let peak = 0;
          for (let j = 0; j < size; j++) {
            const value = Math.abs(channel[i * size + j] ?? 0);
            if (value > peak) peak = value;
          }
          result.push(peak);
        }
        void ctx.close();
        if (!cancelled) setPeaks(result);
      } catch {
        /* streaming-only source; the scrubber falls back to a plain bar */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, peaks.length]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setTime(value);
  };

  return (
    <div className={cn('space-y-2', compact && 'space-y-1.5')}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || durationHint || 0)}
        onTimeUpdate={(e) => {
          const value = e.currentTarget.currentTime;
          setTime(value);
          onTime?.(value);
        }}
        onEnded={() => setPlaying(false)}
      />

      <Waveform
        peaks={peaks}
        progress={duration ? time / duration : 0}
        onScrub={(ratio) => seek(ratio * duration)}
        height={compact ? 32 : 48}
      />

      <div className="flex items-center gap-2">
        <Button variant="secondary" size="icon-sm" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? <Pause className="fill-current" /> : <Play className="fill-current" />}
        </Button>
        <Tooltip content="Back 10s">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => seek(Math.max(0, time - 10))}
            aria-label="Back ten seconds"
          >
            <Rewind />
          </Button>
        </Tooltip>

        <span className="font-mono text-2xs tabular-nums text-tertiary">
          {formatDuration(time)} / {formatDuration(duration)}
        </span>

        <div className="flex-1" />

        <Select value={speed} onValueChange={setSpeed}>
          <SelectTrigger size="sm" className="w-16">
            <span className="text-xs">{speed}×</span>
          </SelectTrigger>
          <SelectContent>
            {SPEEDS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}×
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="hidden items-center gap-1.5 sm:flex">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              const audio = audioRef.current;
              if (!audio) return;
              audio.muted = !muted;
              setMuted(!muted);
            }}
            aria-label="Mute"
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>
          <Slider
            className="w-20"
            value={[muted ? 0 : volume * 100]}
            max={100}
            onValueChange={([value]) => {
              const audio = audioRef.current;
              if (!audio) return;
              audio.volume = value / 100;
              audio.muted = value === 0;
              setVolume(value / 100);
              setMuted(value === 0);
            }}
          />
        </div>
      </div>
    </div>
  );
}
