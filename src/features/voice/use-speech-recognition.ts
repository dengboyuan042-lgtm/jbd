'use client';

import * as React from 'react';

/**
 * Browser ASR provider (client side of the speech abstraction).
 *
 * Uses the Web Speech API, which runs on-device in Chromium/Safari, so live
 * transcription works with no key and no audio leaving the machine. It emits
 * the same segment shape the server providers produce, so downstream code
 * (diarisation, indexing, citations) is identical either way.
 */

export type LiveSegment = {
  id: string;
  text: string;
  start: number;
  end: number;
  final: boolean;
  confidence?: number;
};

type Options = {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  /** seconds since capture began, supplied by the recorder clock */
  getElapsed: () => number;
  onSegment?: (segment: LiveSegment) => void;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

export function speechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition,
  );
}

export function useSpeechRecognition(options: Options) {
  const [listening, setListening] = React.useState(false);
  const [interim, setInterim] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [segments, setSegments] = React.useState<LiveSegment[]>([]);

  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null);
  const shouldRestart = React.useRef(false);
  const segmentStart = React.useRef(0);
  const optionsRef = React.useRef(options);
  optionsRef.current = options;

  const create = React.useCallback((): SpeechRecognitionLike | null => {
    const Ctor =
      (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!Ctor) return null;
    const recognition: SpeechRecognitionLike = new Ctor();
    recognition.lang = optionsRef.current.language ?? navigator.language ?? 'en-US';
    recognition.continuous = optionsRef.current.continuous ?? true;
    recognition.interimResults = optionsRef.current.interimResults ?? true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      let pending = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = String(result[0]?.transcript ?? '').trim();
        if (!text) continue;
        if (result.isFinal) {
          const end = optionsRef.current.getElapsed();
          const segment: LiveSegment = {
            id: `seg-${Date.now()}-${i}`,
            text,
            start: segmentStart.current,
            end,
            final: true,
            confidence: result[0]?.confidence,
          };
          segmentStart.current = end;
          setSegments((prev) => [...prev, segment]);
          optionsRef.current.onSegment?.(segment);
        } else {
          pending += `${text} `;
        }
      }
      setInterim(pending.trim());
    };

    recognition.onerror = (event: any) => {
      const code = String(event?.error ?? 'unknown');
      if (code === 'no-speech' || code === 'aborted') return;
      setError(
        code === 'not-allowed'
          ? 'Microphone access was blocked.'
          : code === 'network'
            ? 'Speech recognition lost its network connection.'
            : `Speech recognition error: ${code}`,
      );
    };

    recognition.onend = () => {
      // Chrome ends the session periodically; restart to keep a long capture alive.
      if (shouldRestart.current) {
        try {
          recognition.start();
          return;
        } catch {
          /* fall through */
        }
      }
      setListening(false);
    };

    return recognition;
  }, []);

  const start = React.useCallback(() => {
    if (recognitionRef.current) return;
    const recognition = create();
    if (!recognition) {
      setError(
        'This browser has no on-device speech recognition. Chrome, Edge or Safari support it — or configure a hosted transcription provider.',
      );
      return;
    }
    recognitionRef.current = recognition;
    shouldRestart.current = true;
    segmentStart.current = optionsRef.current.getElapsed();
    setError(null);
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError('Could not start speech recognition.');
    }
  }, [create]);

  const stop = React.useCallback(() => {
    shouldRestart.current = false;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    setListening(false);
    setInterim('');
    try {
      recognition?.stop();
    } catch {
      /* already stopped */
    }
  }, []);

  const reset = React.useCallback(() => {
    setSegments([]);
    setInterim('');
    segmentStart.current = 0;
  }, []);

  React.useEffect(
    () => () => {
      shouldRestart.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
    },
    [],
  );

  return {
    supported: speechRecognitionSupported(),
    listening,
    interim,
    segments,
    error,
    start,
    stop,
    reset,
    setSegments,
  };
}
