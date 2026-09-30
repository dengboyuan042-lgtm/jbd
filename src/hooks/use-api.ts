'use client';

import * as React from 'react';

import { ApiError, api } from '@/lib/api';

type State<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

/** Minimal data fetching with manual refresh — no cache layer, by design. */
export function useApi<T>(
  path: string | null,
  options: { skip?: boolean } = {},
): State<T> & { refresh: () => void; setData: (updater: (prev: T | null) => T | null) => void } {
  const [state, setState] = React.useState<State<T>>({
    data: null,
    error: null,
    loading: Boolean(path) && !options.skip,
  });
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    if (!path || options.skip) {
      setState((s) => ({ ...s, loading: false }));
      return;
    }
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .get<T>(path)
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          data: null,
          error: error instanceof ApiError ? error.message : 'Could not load.',
          loading: false,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [path, nonce, options.skip]);

  const setData = React.useCallback(
    (updater: (prev: T | null) => T | null) =>
      setState((s) => ({ ...s, data: updater(s.data) })),
    [],
  );

  return { ...state, refresh: () => setNonce((n) => n + 1), setData };
}

export function useDebouncedValue<T>(value: T, delay = 220): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Register a global keyboard shortcut. `mod` maps to ⌘ / Ctrl. */
export function useHotkey(
  combo: string,
  handler: (event: KeyboardEvent) => void,
  options: { enabled?: boolean; allowInInput?: boolean } = {},
) {
  const ref = React.useRef(handler);
  ref.current = handler;

  React.useEffect(() => {
    if (options.enabled === false) return;
    const parts = combo.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    const needsMod = parts.includes('mod');
    const needsShift = parts.includes('shift');
    const needsAlt = parts.includes('alt');

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const inField =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (inField && !options.allowInInput) return;
      if (event.key.toLowerCase() !== key) return;
      if (needsMod !== (event.metaKey || event.ctrlKey)) return;
      if (needsShift !== event.shiftKey) return;
      if (needsAlt !== event.altKey) return;
      ref.current(event);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [combo, options.enabled, options.allowInInput]);
}

/** Persisted UI preference (sidebar width, panel open, …). */
export function useLocalState<T>(key: string, initial: T) {
  const [value, setValue] = React.useState<T>(initial);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, [key]);

  React.useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, [key, value, hydrated]);

  return [value, setValue, hydrated] as const;
}
