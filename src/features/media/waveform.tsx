'use client';

import * as React from 'react';

/**
 * Canvas waveform. Used both for playback scrubbing (decoded peaks) and for
 * live capture (analyser output), so recording and review look the same.
 */
export function Waveform({
  peaks,
  progress = 0,
  onScrub,
  height = 48,
  live,
}: {
  peaks: number[];
  progress?: number;
  onScrub?: (ratio: number) => void;
  height?: number;
  live?: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = wrap.clientWidth;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const styles = getComputedStyle(document.documentElement);
      const played = styles.getPropertyValue('--fg').trim() || '#111';
      const pending = styles.getPropertyValue('--border-strong').trim() || '#ccc';

      const barWidth = 2;
      const gap = 1.5;
      const count = Math.max(1, Math.floor(width / (barWidth + gap)));
      const source = peaks.length ? peaks : new Array(count).fill(0.04);
      const step = source.length / count;
      const max = Math.max(...source, 0.01);

      for (let i = 0; i < count; i++) {
        const slice = source.slice(Math.floor(i * step), Math.floor((i + 1) * step));
        const value = slice.length ? Math.max(...slice) : 0;
        const normalised = Math.min(1, value / max);
        const barHeight = Math.max(2, normalised * (height - 4));
        const x = i * (barWidth + gap);
        const y = (height - barHeight) / 2;
        ctx.fillStyle = i / count <= progress ? played : pending;
        ctx.globalAlpha = i / count <= progress ? 0.9 : 0.45;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 1);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [peaks, progress, height]);

  return (
    <div
      ref={wrapRef}
      className={onScrub ? 'cursor-pointer' : undefined}
      onClick={(event) => {
        if (!onScrub) return;
        const rect = event.currentTarget.getBoundingClientRect();
        onScrub(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
      }}
      aria-hidden={!onScrub}
    >
      <canvas ref={canvasRef} className={live ? 'opacity-90' : undefined} />
    </div>
  );
}
