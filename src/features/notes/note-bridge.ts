'use client';

import * as React from 'react';

/**
 * Narrow channel between the note editor (centre) and the writing assistant
 * (right panel), so neither component owns the other's state.
 */
type Selection = { text: string; start: number; end: number };

type Handlers = {
  getContent: () => string;
  replaceRange: (start: number, end: number, text: string) => void;
  append: (text: string) => void;
};

let selection: Selection = { text: '', start: 0, end: 0 };
let handlers: Handlers | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export const noteBridge = {
  connect(next: Handlers) {
    handlers = next;
    return () => {
      if (handlers === next) handlers = null;
    };
  },
  setSelection(next: Selection) {
    if (
      next.text === selection.text &&
      next.start === selection.start &&
      next.end === selection.end
    ) {
      return;
    }
    selection = next;
    emit();
  },
  clearSelection() {
    if (!selection.text) return;
    selection = { text: '', start: 0, end: 0 };
    emit();
  },
  getSelection: () => selection,
  getContent: () => handlers?.getContent() ?? '',
  replaceSelection(text: string) {
    if (!handlers) return;
    handlers.replaceRange(selection.start, selection.end, text);
    this.clearSelection();
  },
  append(text: string) {
    handlers?.append(text);
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

const EMPTY: Selection = { text: '', start: 0, end: 0 };

export function useNoteSelection(): Selection {
  return React.useSyncExternalStore(
    noteBridge.subscribe,
    noteBridge.getSelection,
    () => EMPTY,
  );
}
