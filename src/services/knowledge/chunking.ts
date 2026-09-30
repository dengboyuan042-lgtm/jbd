import { estimateTokens, looksLikeHeading, splitSentences } from '@/services/ai/nlp';

export type ChunkInput = {
  text: string;
  page?: number;
  heading?: string;
  startTime?: number;
  endTime?: number;
  metadata?: Record<string, unknown>;
};

export type Chunk = {
  ordinal: number;
  content: string;
  tokens: number;
  page?: number;
  heading?: string;
  startTime?: number;
  endTime?: number;
  metadata: Record<string, unknown>;
};

export type ChunkOptions = {
  /** target size in estimated tokens */
  targetTokens?: number;
  /** sentences of overlap carried into the next chunk */
  overlapSentences?: number;
  maxTokens?: number;
};

/**
 * Sentence-aware chunking with overlap.
 *
 * Chunks never span a page/slide/time boundary, which is what makes a
 * citation ("page 37", "12:31") exact rather than approximate.
 */
export function chunkSegments(
  segments: ChunkInput[],
  options: ChunkOptions = {},
): Chunk[] {
  const target = options.targetTokens ?? 320;
  const max = options.maxTokens ?? 520;
  const overlap = options.overlapSentences ?? 1;
  const chunks: Chunk[] = [];

  for (const segment of segments) {
    const text = segment.text.replace(/\s+\n/g, '\n').trim();
    if (!text) continue;

    const sentences = splitSentences(text);
    if (!sentences.length) continue;

    let buffer: string[] = [];
    let tokens = 0;

    const flush = () => {
      if (!buffer.length) return;
      // Keep headings on their own line so the structure survives re-parsing
      // when the chunk is later summarised or quoted.
      const content = buffer
        .map((sentence, i) =>
          looksLikeHeading(sentence) && i < buffer.length - 1
            ? `${sentence}\n`
            : `${sentence} `,
        )
        .join('')
        .trim();
      if (content.length < 2) {
        buffer = [];
        tokens = 0;
        return;
      }
      chunks.push({
        ordinal: chunks.length,
        content,
        tokens: estimateTokens(content),
        page: segment.page,
        heading: segment.heading,
        startTime: segment.startTime,
        endTime: segment.endTime,
        metadata: segment.metadata ?? {},
      });
      buffer = overlap > 0 ? buffer.slice(-overlap) : [];
      tokens = buffer.reduce((a, s) => a + estimateTokens(s), 0);
    };

    for (const sentence of sentences) {
      const size = estimateTokens(sentence);
      if (size > max) {
        // A single oversized sentence (tables, dense PDFs) is hard-split.
        flush();
        for (const piece of hardSplit(sentence, max)) {
          chunks.push({
            ordinal: chunks.length,
            content: piece,
            tokens: estimateTokens(piece),
            page: segment.page,
            heading: segment.heading,
            startTime: segment.startTime,
            endTime: segment.endTime,
            metadata: segment.metadata ?? {},
          });
        }
        continue;
      }
      if (tokens + size > target && buffer.length) flush();
      buffer.push(sentence);
      tokens += size;
    }
    flush();
  }

  return chunks.map((c, i) => ({ ...c, ordinal: i }));
}

function hardSplit(text: string, maxTokens: number): string[] {
  const maxChars = maxTokens * 4;
  const out: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    out.push(text.slice(i, i + maxChars));
  }
  return out;
}

/** Interpolate time boundaries for transcript-derived chunks. */
export function chunkTranscript(
  segments: { text: string; start: number; end: number; speaker?: string }[],
  options: ChunkOptions = {},
): Chunk[] {
  const target = options.targetTokens ?? 260;
  const chunks: Chunk[] = [];
  let buffer: typeof segments = [];
  let tokens = 0;

  const flush = () => {
    if (!buffer.length) return;
    const content = buffer
      .map((s) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text))
      .join('\n');
    chunks.push({
      ordinal: chunks.length,
      content,
      tokens: estimateTokens(content),
      startTime: buffer[0].start,
      endTime: buffer[buffer.length - 1].end,
      metadata: {
        speakers: [...new Set(buffer.map((s) => s.speaker).filter(Boolean))],
      },
    });
    buffer = [];
    tokens = 0;
  };

  for (const segment of segments) {
    const size = estimateTokens(segment.text);
    if (tokens + size > target && buffer.length) flush();
    buffer.push(segment);
    tokens += size;
  }
  flush();
  return chunks;
}
