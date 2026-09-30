import { env } from '@/lib/env';
import { contentWords } from './nlp';
import type { EmbeddingProvider } from './types';

/**
 * Deterministic bag-of-features embedder (hashed random projection).
 *
 * Words, word bigrams and character trigrams are hashed into signed buckets
 * with sub-linear term weighting, then L2-normalised. Cosine similarity over
 * these vectors is a genuine lexical-semantic signal — weaker than a neural
 * embedder, but real, instant, free and stable across restarts. Switching
 * `EMBEDDING_DRIVER=provider` replaces it without touching the search code.
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'local';
  readonly model = 'local-hash-v1';

  constructor(readonly dimensions: number) {}

  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.embedOne(t));
  }

  private embedOne(text: string): number[] {
    const vec = new Float64Array(this.dimensions);
    const words = contentWords(text).slice(0, 4000);

    const add = (feature: string, weight: number) => {
      const h = hash32(feature);
      const bucket = h % this.dimensions;
      const sign = (hash32(`s:${feature}`) & 1) === 0 ? 1 : -1;
      vec[bucket] += sign * weight;
    };

    const tf = new Map<string, number>();
    for (const w of words) tf.set(w, (tf.get(w) ?? 0) + 1);
    for (const [word, count] of tf) {
      add(word, 1 + Math.log(count));
      // char trigrams give partial credit for morphological variants
      const padded = `#${word}#`;
      for (let i = 0; i < padded.length - 2; i++) {
        add(`c:${padded.slice(i, i + 3)}`, 0.28);
      }
    }
    for (let i = 0; i < words.length - 1; i++) {
      add(`b:${words[i]}_${words[i + 1]}`, 0.55);
    }

    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    const out = new Array<number>(this.dimensions);
    for (let i = 0; i < this.dimensions; i++) out[i] = vec[i] / norm;
    return out;
  }
}

/** OpenAI-compatible `/embeddings` endpoint. */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'openai';

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    readonly model: string,
    readonly dimensions: number,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += 96) {
      const batch = texts.slice(i, i + 96);
      const res = await fetch(`${this.baseUrl}/embeddings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: batch,
          dimensions: this.dimensions,
        }),
      });
      if (!res.ok) throw new Error(`Embeddings: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as any;
      for (const item of data.data) out.push(item.embedding as number[]);
    }
    return out;
  }
}

export class GoogleEmbeddingProvider implements EmbeddingProvider {
  readonly id = 'google';

  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string,
    readonly model: string,
    readonly dimensions: number,
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const out: number[][] = [];
    for (const text of texts) {
      const res = await fetch(
        `${this.baseUrl}/models/${this.model}:embedContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            content: { parts: [{ text }] },
            outputDimensionality: this.dimensions,
          }),
        },
      );
      if (!res.ok) throw new Error(`Embeddings: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as any;
      out.push(data.embedding.values as number[]);
    }
    return out;
  }
}

let cached: EmbeddingProvider | null = null;

export function embeddingProvider(): EmbeddingProvider {
  if (cached) return cached;
  const e = env();
  const dims = e.EMBEDDING_DIMENSIONS;

  if (e.EMBEDDING_DRIVER === 'provider') {
    if ((e.AI_DRIVER === 'openai' || e.AI_DRIVER === 'openai-compatible') && e.OPENAI_API_KEY) {
      cached = new OpenAIEmbeddingProvider(
        e.OPENAI_API_KEY,
        e.OPENAI_BASE_URL,
        e.AI_EMBEDDING_MODEL || 'text-embedding-3-small',
        dims,
      );
      return cached;
    }
    if (e.AI_DRIVER === 'google' && e.GOOGLE_API_KEY) {
      cached = new GoogleEmbeddingProvider(
        e.GOOGLE_API_KEY,
        e.GOOGLE_BASE_URL,
        e.AI_EMBEDDING_MODEL || 'text-embedding-004',
        dims,
      );
      return cached;
    }
  }
  cached = new LocalEmbeddingProvider(dims);
  return cached;
}

function hash32(text: string): number {
  // FNV-1a
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
