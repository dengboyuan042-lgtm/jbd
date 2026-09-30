import type { SourceKind } from '@/server/db/schema';

export type QueryIntent = {
  /** the query with recognised filter phrases removed */
  text: string;
  original: string;
  since: Date | null;
  until: Date | null;
  kinds: SourceKind[] | undefined;
  /** human-readable description of what was applied, shown in the UI */
  applied: string[];
};

const KIND_WORDS: { pattern: RegExp; kinds: SourceKind[]; label: string }[] = [
  { pattern: /\b(meetings?|calls?|recordings?|audio)\b/i, kinds: ['recording'], label: 'recordings' },
  { pattern: /\b(notes?)\b/i, kinds: ['note'], label: 'notes' },
  { pattern: /\b(pdfs?|documents?|docs?|files?|slides?|decks?)\b/i, kinds: ['file'], label: 'files' },
  { pattern: /\b(articles?|web ?pages?|links?|websites?)\b/i, kinds: ['webpage'], label: 'web pages' },
  { pattern: /\b(videos?|youtube)\b/i, kinds: ['youtube'], label: 'videos' },
  { pattern: /\b(chats?|conversations?|threads?)\b/i, kinds: ['chat'], label: 'chats' },
];

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

/**
 * Lightweight natural-language query understanding: pulls time ranges and
 * content-type filters out of the phrasing so "meetings last month about
 * server capacity" narrows before it ranks. Runs before retrieval and needs
 * no model call, so the palette stays instant.
 */
export function parseQueryIntent(query: string, now = new Date()): QueryIntent {
  let text = query;
  const applied: string[] = [];
  let since: Date | null = null;
  let until: Date | null = null;

  const consume = (pattern: RegExp) => {
    const match = text.match(pattern);
    if (match) text = text.replace(match[0], ' ');
    return match;
  };

  const startOfDay = (d: Date) => {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
  };
  const daysAgo = (n: number) => {
    const c = new Date(now);
    c.setDate(c.getDate() - n);
    return startOfDay(c);
  };

  if (consume(/\btoday\b/i)) {
    since = startOfDay(now);
    applied.push('today');
  } else if (consume(/\byesterday\b/i)) {
    since = daysAgo(1);
    until = startOfDay(now);
    applied.push('yesterday');
  } else if (consume(/\b(?:this|past|last) week\b/i)) {
    since = daysAgo(7);
    applied.push('past week');
  } else if (consume(/\b(?:this|past|last) month\b/i)) {
    since = daysAgo(30);
    applied.push('past month');
  } else if (consume(/\b(?:this|past|last) quarter\b/i)) {
    since = daysAgo(90);
    applied.push('past quarter');
  } else if (consume(/\b(?:this|past|last) year\b/i)) {
    since = daysAgo(365);
    applied.push('past year');
  } else {
    const relative = consume(/\b(?:in the )?(?:past|last)\s+(\d{1,3})\s+(day|week|month|year)s?\b/i);
    if (relative) {
      const n = Number(relative[1]);
      const unit = relative[2].toLowerCase();
      const multiplier = unit === 'day' ? 1 : unit === 'week' ? 7 : unit === 'month' ? 30 : 365;
      since = daysAgo(n * multiplier);
      applied.push(`past ${n} ${unit}${n === 1 ? '' : 's'}`);
    } else {
      const monthMatch = consume(
        new RegExp(`\\b(?:in\\s+)?(${MONTHS.join('|')})(?:\\s+(\\d{4}))?\\b`, 'i'),
      );
      if (monthMatch) {
        const monthIndex = MONTHS.indexOf(monthMatch[1].toLowerCase());
        const year = monthMatch[2] ? Number(monthMatch[2]) : now.getFullYear();
        since = new Date(year, monthIndex, 1);
        until = new Date(year, monthIndex + 1, 1);
        applied.push(`${monthMatch[1]} ${year}`);
      }
    }
  }

  const kinds = new Set<SourceKind>();
  for (const entry of KIND_WORDS) {
    if (entry.pattern.test(text)) {
      entry.kinds.forEach((k) => kinds.add(k));
      applied.push(entry.label);
      // the type word stays in the text — it is usually also a content term
    }
  }

  text = text
    .replace(/\b(?:all|any|every|show me|find|search for|look for|about|regarding|related to|discussing|discussed|mentioning)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    text: text || query,
    original: query,
    since,
    until,
    kinds: kinds.size ? [...kinds] : undefined,
    applied,
  };
}
