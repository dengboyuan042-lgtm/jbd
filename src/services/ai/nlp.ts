/**
 * Dependency-free text analytics used by the local AI provider.
 *
 * These are real algorithms (TF-IDF, TextRank-style centrality, cue-phrase
 * extraction) — not placeholder text. They give the product working
 * summarisation, extraction and study-item generation with no API key, and
 * they are what a hosted model replaces rather than something it duplicates.
 */

const STOPWORDS = new Set(
  `a about above after again against all am an and any are aren't as at be because been before being below between both but by can cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would wouldn't you you'd you'll you're you've your yours yourself yourselves also just like get got make made use used using thing things really actually basically going know think said say says will shall may might must can't one two three new way lot`
    .split(/\s+/)
    .filter(Boolean),
);

export function tokenize(text: string): string[] {
  return (
    text
      .toLowerCase()
      .match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []
  ).filter((t) => t.length > 1);
}

/**
 * Very light suffix stripper. Not a full Porter stemmer — just enough that
 * "risks"/"risk" and "migrating"/"migration" match during term overlap.
 */
export function stem(word: string): string {
  let w = word.toLowerCase();
  if (w.length <= 3) return w;
  for (const suffix of ['ational', 'iveness', 'fulness', 'ousness', 'ization', 'ations']) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      return `${w.slice(0, -suffix.length)}at`;
    }
  }
  for (const suffix of ['ements', 'ement', 'ments', 'ment', 'tions', 'tion', 'sions', 'sion', 'ances', 'ance', 'ences', 'ence', 'ings', 'ing', 'ies', 'ied', 'ers', 'er', 'est', 'ed', 'ly', 'es', 's']) {
    if (w.endsWith(suffix) && w.length - suffix.length >= 3) {
      w = w.slice(0, -suffix.length);
      break;
    }
  }
  if (w.endsWith('i')) w = `${w.slice(0, -1)}y`;
  return w;
}

/** Stemmed content words, used wherever two texts are compared by term. */
export function contentStems(text: string): string[] {
  return contentWords(text).map(stem);
}

export function contentWords(text: string): string[] {
  return tokenize(text).filter((t) => !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/**
 * Sentence segmentation that survives abbreviations, decimals and CJK.
 *
 * Line structure is respected first: Markdown headings, list items and table
 * rows are standalone units. Without this a heading would be glued onto the
 * following paragraph and every downstream summary would inherit the error.
 */
export function splitSentences(text: string): string[] {
  if (!text.trim()) return [];
  const lines = text.split('\n');
  const units: string[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    const joined = paragraph.join(' ').trim();
    paragraph = [];
    if (joined) units.push(...splitProse(joined));
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushParagraph();
      continue;
    }
    const structural =
      /^#{1,6}\s+/.test(line) || // heading
      /^[-*+]\s+/.test(line) || // bullet
      /^\d+[.)]\s+/.test(line) || // ordered item
      /^>\s?/.test(line) || // quote
      /^\|/.test(line) || // table row
      /^```/.test(line) || // fence
      looksLikeHeading(line); // bare title line (e.g. de-marked heading)
    if (structural) {
      flushParagraph();
      const cleaned = stripMarkdown(line);
      if (cleaned.length > 1) units.push(cleaned);
      continue;
    }
    paragraph.push(line);
  }
  flushParagraph();
  return units;
}

function stripMarkdown(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^[-*+]\s+(\[[ xX]\]\s*)?/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .replace(/`{1,3}/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .trim();
}

function splitProse(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const out: string[] = [];
  let buffer = '';
  const abbrev = /\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|e\.g|i\.e|fig|no|vol|ch|approx|inc|ltd|co)\.$/i;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    buffer += ch;
    if (!'.!?。！？…'.includes(ch)) continue;
    const next = normalized[i + 1] ?? ' ';
    if (ch === '.' && /\d/.test(normalized[i - 1] ?? '') && /\d/.test(next)) continue;
    if (abbrev.test(buffer.trimEnd())) continue;
    if (/[\s"'”’)\]]/.test(next) || i === normalized.length - 1) {
      const trimmed = buffer.trim();
      if (trimmed) out.push(trimmed);
      buffer = '';
    }
  }
  const tail = buffer.trim();
  if (tail) out.push(tail);
  return out.filter((s) => s.length > 1);
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export type Scored<T> = { item: T; score: number };

/** Term frequencies for a single document. */
export function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
  return tf;
}

/** Inverse document frequency across a sentence/chunk corpus. */
export function inverseDocumentFrequency(
  docs: string[][],
): Map<string, number> {
  const df = new Map<string, number>();
  for (const doc of docs) {
    for (const term of new Set(doc)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const idf = new Map<string, number>();
  const n = Math.max(docs.length, 1);
  for (const [term, count] of df) idf.set(term, Math.log(1 + n / (1 + count)) + 1);
  return idf;
}

/** Ranked salient terms — the backbone of topics, tags and glossary entries. */
export function keywords(text: string, limit = 12): Scored<string>[] {
  const sentences = splitSentences(text);
  const docs = sentences.map((s) => contentWords(s));
  const idf = inverseDocumentFrequency(docs);
  const tf = termFrequency(contentWords(text));

  const unigram = new Map<string, number>();
  for (const [term, freq] of tf) {
    unigram.set(term, (1 + Math.log(freq)) * (idf.get(term) ?? 1));
  }

  // Bigrams that appear more than once are usually the real domain terms.
  const words = contentWords(text);
  const bigrams = new Map<string, number>();
  for (let i = 0; i < words.length - 1; i++) {
    const bg = `${words[i]} ${words[i + 1]}`;
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }

  const scored: Scored<string>[] = [];
  for (const [bg, count] of bigrams) {
    if (count < 2) continue;
    const [a, b] = bg.split(' ');
    scored.push({
      item: bg,
      score: count * 1.6 * (((idf.get(a) ?? 1) + (idf.get(b) ?? 1)) / 2),
    });
  }
  for (const [term, score] of unigram) scored.push({ item: term, score });

  scored.sort((a, b) => b.score - a.score);

  const seen = new Set<string>();
  const result: Scored<string>[] = [];
  for (const entry of scored) {
    const parts = entry.item.split(' ');
    if (parts.some((p) => seen.has(p)) && parts.length === 1) continue;
    parts.forEach((p) => seen.add(p));
    result.push(entry);
    if (result.length >= limit) break;
  }
  return result;
}

/**
 * Extractive summary via similarity-graph centrality (TextRank family),
 * biased toward document-opening and cue-phrase sentences.
 */
export function rankSentences(text: string): Scored<string>[] {
  const sentences = splitSentences(text);
  if (sentences.length <= 1) return sentences.map((s) => ({ item: s, score: 1 }));

  const docs = sentences.map((s) => contentWords(s));
  const idf = inverseDocumentFrequency(docs);
  const vectors = docs.map((doc) => {
    const tf = termFrequency(doc);
    const vec = new Map<string, number>();
    let norm = 0;
    for (const [term, freq] of tf) {
      const w = (1 + Math.log(freq)) * (idf.get(term) ?? 1);
      vec.set(term, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [term, w] of vec) vec.set(term, w / norm);
    return vec;
  });

  const n = sentences.length;
  const sim: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let dot = 0;
      const a = vectors[i];
      const b = vectors[j];
      const [small, large] = a.size < b.size ? [a, b] : [b, a];
      for (const [term, w] of small) dot += w * (large.get(term) ?? 0);
      sim[i][j] = dot;
      sim[j][i] = dot;
    }
  }

  // Power iteration over the row-normalised similarity matrix.
  let rank = new Array(n).fill(1 / n);
  const damping = 0.85;
  const rowSums = sim.map((row) => row.reduce((a, b) => a + b, 0) || 1);
  for (let iter = 0; iter < 24; iter++) {
    const next = new Array(n).fill((1 - damping) / n);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j || sim[j][i] === 0) continue;
        next[i] += damping * rank[j] * (sim[j][i] / rowSums[j]);
      }
    }
    rank = next;
  }

  const cue = /\b(conclusion|summary|in short|therefore|key|important|result|we found|overall|decided|must|should|propose|recommend|risk|deadline|because)\b/i;

  return sentences.map((sentence, i) => {
    const positionBoost = i < 3 ? 1.25 - i * 0.08 : 1;
    const lengthPenalty =
      sentence.length < 40 ? 0.6 : sentence.length > 320 ? 0.75 : 1;
    const cueBoost = cue.test(sentence) ? 1.3 : 1;
    // Headings carry topic signal but read badly inside a summary.
    const headingPenalty = looksLikeHeading(sentence) ? 0.12 : 1;
    return {
      item: sentence,
      score: rank[i] * positionBoost * lengthPenalty * cueBoost * headingPenalty,
    };
  });
}

/** A short, unpunctuated, title-shaped line is a heading, not a statement. */
export function looksLikeHeading(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 70) return false;
  if (/[.!?;:]$/.test(trimmed)) return false;
  const words = trimmed.split(/\s+/);
  if (words.length > 9) return false;
  const hasVerb =
    /\b(is|are|was|were|has|have|will|can|should|must|do|does|did|runs?|uses?|needs?|takes?|makes?|shows?)\b/i.test(
      trimmed,
    );
  return !hasVerb;
}

export function extractiveSummary(text: string, maxSentences = 5): string[] {
  const ranked = rankSentences(text);
  const order = new Map(ranked.map((r, i) => [r.item, i]));
  return [...ranked]
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => (order.get(a.item) ?? 0) - (order.get(b.item) ?? 0))
    .map((r) => r.item);
}

const ACTION_PATTERNS = [
  /\b(?:i|we|you|he|she|they|team|[A-Z][a-z]+)\s+(?:will|'ll|should|must|need(?:s)? to|have to|has to|is going to|are going to)\s+(.{6,180})/i,
  /\b(?:action item|todo|to-do|next step|follow[- ]up|assign(?:ed)? to|owner)\s*[:—-]\s*(.{4,180})/i,
  /\b(?:let'?s|please)\s+(.{6,180})/i,
];

const DECISION_PATTERNS = [
  /\b(?:we (?:have )?(?:decided|agreed)|decision(?: is)?|it was agreed|conclusion(?: is)?|we'?ll go with|settled on)\b\s*[:—-]?\s*(.{6,200})/i,
  /\b(?:approved|rejected|signed off|green[- ]?lit)\b\s+(.{4,180})/i,
];

const QUESTION_PATTERNS = [/\?\s*$/];

const DATE_PATTERN =
  /\b(?:by |before |due |on |until )?(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day|tomorrow|today|next week|next month|end of (?:the )?(?:week|month|quarter|day)|Q[1-4]|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d{1,2}(?:,? \d{4})?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/i;

export type ExtractedItem = {
  text: string;
  sentence: string;
  index: number;
  due?: string;
  owner?: string;
};

function cleanup(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/^[\s,;:—-]+/, '')
    .replace(/[\s,;]+$/, '')
    .trim();
}

export function extractActionItems(text: string): ExtractedItem[] {
  const sentences = splitSentences(text);
  const out: ExtractedItem[] = [];
  const seen = new Set<string>();
  sentences.forEach((sentence, index) => {
    for (const pattern of ACTION_PATTERNS) {
      const match = sentence.match(pattern);
      if (!match) continue;
      const body = cleanup(match[1] ?? sentence);
      if (body.length < 6) continue;
      const key = body.toLowerCase().slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      const ownerMatch = sentence.match(
        /\b([A-Z][a-z]{2,})\s+(?:will|should|must|needs? to|is going to)\b/,
      );
      out.push({
        text: body.charAt(0).toUpperCase() + body.slice(1),
        sentence,
        index,
        due: sentence.match(DATE_PATTERN)?.[0]?.trim(),
        owner: ownerMatch?.[1],
      });
      break;
    }
  });
  return out;
}

export function extractDecisions(text: string): ExtractedItem[] {
  const sentences = splitSentences(text);
  const out: ExtractedItem[] = [];
  sentences.forEach((sentence, index) => {
    for (const pattern of DECISION_PATTERNS) {
      const match = sentence.match(pattern);
      if (!match) continue;
      let body = cleanup(match[1] ?? sentence);
      // A fragment that opens with a connective is not a readable statement;
      // fall back to the whole sentence in that case.
      if (/^(that|to|on|with|for|in|by|about)\b/i.test(body) || body.length < 12) {
        body = cleanup(sentence);
      }
      out.push({
        text: body.charAt(0).toUpperCase() + body.slice(1),
        sentence,
        index,
      });
      break;
    }
  });
  return out;
}

export function extractQuestions(text: string): ExtractedItem[] {
  return splitSentences(text)
    .map((sentence, index) => ({ sentence, index }))
    .filter(({ sentence }) => QUESTION_PATTERNS.some((p) => p.test(sentence)))
    .map(({ sentence, index }) => ({ text: sentence, sentence, index }));
}

/** Definition-shaped sentences: "X is …", "X refers to …", "X: …". */
export type Definition = { term: string; definition: string; sentence: string };

export function extractDefinitions(text: string, limit = 20): Definition[] {
  const sentences = splitSentences(text);
  const out: Definition[] = [];
  const seen = new Set<string>();
  const patterns = [
    /^(?:the\s+)?([\p{Lu}][\p{L}\p{N}\s-]{2,44}?)\s+(?:is|are|was|were|refers to|means|denotes|describes|represents)\s+(?:a|an|the)?\s*(.{12,240})$/u,
    /^([\p{L}\p{N}\s-]{3,44}?)\s*[:—–]\s*(.{12,240})$/u,
  ];
  for (const sentence of sentences) {
    for (const pattern of patterns) {
      const match = sentence.match(pattern);
      if (!match) continue;
      const term = cleanup(match[1]);
      const definition = cleanup(match[2]);
      const key = term.toLowerCase();
      if (
        key.length < 3 ||
        seen.has(key) ||
        STOPWORDS.has(key) ||
        term.split(/\s+/).length > 6
      )
        continue;
      seen.add(key);
      out.push({ term, definition, sentence });
      break;
    }
    if (out.length >= limit) break;
  }
  return out;
}

/** Group sentences into topical clusters for outlines and mind maps. */
export type TopicCluster = {
  label: string;
  terms: string[];
  sentences: { text: string; index: number }[];
};

export function clusterTopics(text: string, maxTopics = 6): TopicCluster[] {
  const sentences = splitSentences(text);
  if (!sentences.length) return [];
  const top = keywords(text, maxTopics * 2);
  const clusters: TopicCluster[] = [];

  for (const { item } of top) {
    const terms = item.split(' ');
    const matched = sentences
      .map((text, index) => ({ text, index }))
      .filter(({ text: s }) => {
        const lower = s.toLowerCase();
        return terms.every((t) => lower.includes(t));
      });
    if (matched.length < 1) continue;
    if (clusters.some((c) => overlap(c.sentences, matched) > 0.6)) continue;
    clusters.push({
      label: titleCase(item),
      terms,
      sentences: matched.slice(0, 8),
    });
    if (clusters.length >= maxTopics) break;
  }
  return clusters;
}

function overlap(
  a: { index: number }[],
  b: { index: number }[],
): number {
  const setA = new Set(a.map((x) => x.index));
  const common = b.filter((x) => setA.has(x.index)).length;
  return common / Math.max(Math.min(a.length, b.length), 1);
}

export function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Rough token estimate good enough for budgeting context windows. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) ?? []).length;
  const rest = text.length - cjk;
  return Math.ceil(cjk / 1.4 + rest / 4);
}

/** Heuristic language detection across the scripts we care about. */
export function detectLanguage(text: string): string {
  const sample = text.slice(0, 4000);
  if (!sample.trim()) return 'en';
  const counts = {
    zh: (sample.match(/[\u4e00-\u9fff]/g) ?? []).length,
    ja: (sample.match(/[\u3040-\u30ff]/g) ?? []).length,
    ko: (sample.match(/[\uac00-\ud7af]/g) ?? []).length,
    ru: (sample.match(/[\u0400-\u04ff]/g) ?? []).length,
    ar: (sample.match(/[\u0600-\u06ff]/g) ?? []).length,
  };
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] / sample.length > 0.12) return best[0];

  const lower = sample.toLowerCase();
  const profiles: Record<string, string[]> = {
    en: [' the ', ' and ', ' of ', ' to ', ' is '],
    es: [' el ', ' la ', ' que ', ' de ', ' para '],
    fr: [' le ', ' la ', ' des ', ' est ', ' pour '],
    de: [' der ', ' die ', ' und ', ' ist ', ' nicht '],
    pt: [' de ', ' que ', ' não ', ' para ', ' uma '],
  };
  let winner = 'en';
  let winnerScore = 0;
  for (const [lang, markers] of Object.entries(profiles)) {
    const score = markers.reduce(
      (acc, m) => acc + (lower.split(m).length - 1),
      0,
    );
    if (score > winnerScore) {
      winner = lang;
      winnerScore = score;
    }
  }
  return winner;
}

/** Cheap readability proxy used in study-guide difficulty selection. */
export function complexity(sentence: string): number {
  const words = tokenize(sentence);
  if (!words.length) return 0;
  const avgLen = words.reduce((a, w) => a + w.length, 0) / words.length;
  return Math.min(1, (words.length / 32) * 0.5 + (avgLen / 9) * 0.5);
}
