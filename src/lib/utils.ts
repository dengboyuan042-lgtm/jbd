import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(i === 0 ? 0 : decimals)} ${sizes[i]}`;
}

/** 3725 → "1:02:05", 125 → "2:05" */
export function formatDuration(seconds: number, forceHours = false): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0 || forceHours) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

/** Parse "01:23:42" / "12:31" / "42" into seconds. */
export function parseTimestamp(value: string): number | null {
  const parts = value.trim().split(':').map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

export function relativeTime(date: Date | string | number): string {
  const d = new Date(date);
  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < min) return 'just now';
  if (abs < hour) return `${Math.floor(abs / min)}m ago`;
  if (abs < day) return `${Math.floor(abs / hour)}h ago`;
  if (abs < 7 * day) return `${Math.floor(abs / day)}d ago`;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function groupBy<T, K extends string | number>(
  items: readonly T[],
  key: (item: T) => K,
): Record<K, T[]> {
  return items.reduce(
    (acc, item) => {
      const k = key(item);
      (acc[k] ||= []).push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapped = (...args: A) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  wrapped.cancel = () => timer && clearTimeout(timer);
  return wrapped;
}

/** Simple, allocation-light fuzzy subsequence scorer for the command palette. */
export function fuzzyScore(needle: string, haystack: string): number {
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (!n) return 1;
  if (h.includes(n)) return 1000 - h.indexOf(n) + n.length * 2;
  let score = 0;
  let hi = 0;
  let streak = 0;
  for (let ni = 0; ni < n.length; ni++) {
    const idx = h.indexOf(n[ni], hi);
    if (idx === -1) return 0;
    streak = idx === hi ? streak + 1 : 0;
    score += 10 + streak * 4 - Math.min(idx - hi, 10);
    hi = idx + 1;
  }
  return score;
}

export const isBrowser = typeof window !== 'undefined';

export function isMac(): boolean {
  if (!isBrowser) return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
}
