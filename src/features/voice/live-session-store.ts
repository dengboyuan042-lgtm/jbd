'use client';

import * as React from 'react';

import type { LiveSegment } from './use-speech-recognition';

/**
 * Shared state for an in-progress recording.
 *
 * The Record workspace writes to it; the right-hand live assistant reads from
 * it. A module-level store keeps the two panes decoupled without threading
 * state through the shell.
 */
export type LiveSession = {
  recordingId: string | null;
  title: string;
  active: boolean;
  paused: boolean;
  elapsed: number;
  segments: LiveSegment[];
  interim: string;
  language: string;
};

const initial: LiveSession = {
  recordingId: null,
  title: '',
  active: false,
  paused: false,
  elapsed: 0,
  segments: [],
  interim: '',
  language: 'en-US',
};

let state: LiveSession = initial;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export const liveSession = {
  get: () => state,
  set(patch: Partial<LiveSession>) {
    state = { ...state, ...patch };
    emit();
  },
  reset() {
    state = initial;
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  /** Plain-text transcript so far, for grounding live questions. */
  transcript(): string {
    return state.segments.map((s) => s.text).join(' ');
  },
};

export function useLiveSession(): LiveSession {
  return React.useSyncExternalStore(
    liveSession.subscribe,
    liveSession.get,
    () => initial,
  );
}
