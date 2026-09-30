'use client';

import * as React from 'react';

export type RecorderState = 'idle' | 'recording' | 'paused' | 'stopped';

/**
 * Microphone capture: MediaRecorder for the audio file, an AnalyserNode for
 * the live waveform, and a monotonic clock that excludes paused time so
 * transcript timestamps line up with the saved audio.
 */
export function useRecorder() {
  const [state, setState] = React.useState<RecorderState>('idle');
  const [elapsed, setElapsed] = React.useState(0);
  const [level, setLevel] = React.useState(0);
  const [peaks, setPeaks] = React.useState<number[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [blob, setBlob] = React.useState<Blob | null>(null);

  const recorderRef = React.useRef<MediaRecorder | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const chunksRef = React.useRef<BlobPart[]>([]);
  const audioCtxRef = React.useRef<AudioContext | null>(null);
  const analyserRef = React.useRef<AnalyserNode | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const startedAt = React.useRef(0);
  const accumulated = React.useRef(0);

  const getElapsed = React.useCallback(() => {
    if (state === 'recording') {
      return accumulated.current + (Date.now() - startedAt.current) / 1000;
    }
    return accumulated.current;
  }, [state]);

  const tick = React.useCallback(() => {
    const analyser = analyserRef.current;
    if (analyser) {
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const value = (buffer[i] - 128) / 128;
        sum += value * value;
      }
      const rms = Math.sqrt(sum / buffer.length);
      setLevel(rms);
      setPeaks((prev) => {
        const next = [...prev, rms];
        return next.length > 1200 ? next.slice(-1200) : next;
      });
    }
    setElapsed(accumulated.current + (Date.now() - startedAt.current) / 1000);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const cleanup = React.useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  const start = React.useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;

      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
      ].find((type) => MediaRecorder.isTypeSupported(type));

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        setBlob(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.start(1000);
      recorderRef.current = recorder;

      accumulated.current = 0;
      startedAt.current = Date.now();
      setPeaks([]);
      setElapsed(0);
      setBlob(null);
      setState('recording');
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow it in your browser settings to record.'
          : 'Could not access the microphone.',
      );
      cleanup();
    }
  }, [cleanup, tick]);

  const pause = React.useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.pause();
    accumulated.current += (Date.now() - startedAt.current) / 1000;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setState('paused');
  }, []);

  const resume = React.useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== 'paused') return;
    recorder.resume();
    startedAt.current = Date.now();
    setState('recording');
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const stop = React.useCallback(async (): Promise<Blob | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;
    if (state === 'recording') {
      accumulated.current += (Date.now() - startedAt.current) / 1000;
    }
    const result = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.stop();
    });
    recorderRef.current = null;
    cleanup();
    setState('stopped');
    setBlob(result);
    setLevel(0);
    return result;
  }, [cleanup, state]);

  React.useEffect(() => cleanup, [cleanup]);

  /** Downsample the live peaks to a fixed-size array for storage. */
  const waveform = React.useCallback((buckets = 240): number[] => {
    if (!peaks.length) return [];
    const size = Math.max(1, Math.floor(peaks.length / buckets));
    const out: number[] = [];
    for (let i = 0; i < buckets; i++) {
      const slice = peaks.slice(i * size, (i + 1) * size);
      out.push(slice.length ? Math.max(...slice) : 0);
    }
    return out;
  }, [peaks]);

  return {
    state,
    elapsed,
    level,
    peaks,
    error,
    blob,
    start,
    pause,
    resume,
    stop,
    getElapsed,
    waveform,
  };
}
