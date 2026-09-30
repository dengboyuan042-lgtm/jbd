import type { Citation, SourceKind } from '@/server/db/schema';
import { rawQuery } from '@/server/db/client';
import { embeddingProvider } from '@/services/ai/embeddings';
import { contentStems, contentWords } from '@/services/ai/nlp';
import { parseQueryIntent, type QueryIntent } from './intent';

export type SearchMode = 'hybrid' | 'semantic' | 'keyword';

export type SearchFilters = {
  projectId?: string | null;
  kinds?: SourceKind[];
  sourceIds?: string[];
  since?: Date | null;
  until?: Date | null;
};

export type SearchOptions = SearchFilters & {
  userId: string;
  query: string;
  mode?: SearchMode;
  limit?: number;
  /** collapse to one best chunk per source */
  groupBySource?: boolean;
};

export type SearchHit = {
  chunkId: string;
  sourceId: string;
  sourceKind: SourceKind;
  sourceTitle: string;
  sourceUrl: string | null;
  projectId: string | null;
  content: string;
  heading: string | null;
  page: number | null;
  startTime: number | null;
  endTime: number | null;
  updatedAt: string;
  score: number;
  semanticScore: number;
  keywordScore: number;
  citation: Citation;
  highlights: string[];
};

export type SearchResponse = {
  hits: SearchHit[];
  intent: QueryIntent;
  mode: SearchMode;
  tookMs: number;
  counts: { semantic: number; keyword: number };
};

type Row = {
  chunk_id: string;
  source_id: string;
  kind: SourceKind;
  title: string;
  url: string | null;
  project_id: string | null;
  content: string;
  heading: string | null;
  page: number | null;
  start_time: number | null;
  end_time: number | null;
  updated_at: string;
  score: number;
};

/**
 * Hybrid retrieval: dense vectors (pgvector cosine) fused with Postgres
 * full-text ranking via Reciprocal Rank Fusion, then re-scored with lexical
 * coverage and recency. RRF needs no score calibration between the two
 * retrievers, which keeps results stable when the embedding model changes.
 */
export async function search(options: SearchOptions): Promise<SearchResponse> {
  const started = Date.now();
  const intent = parseQueryIntent(options.query);
  const mode = options.mode ?? 'hybrid';
  const limit = Math.min(options.limit ?? 20, 100);
  const pool = Math.max(limit * 4, 40);

  const filters: SearchFilters = {
    projectId: options.projectId,
    kinds: options.kinds?.length ? options.kinds : intent.kinds,
    sourceIds: options.sourceIds,
    since: options.since ?? intent.since,
    until: options.until ?? intent.until,
  };

  const text = intent.text || options.query;

  const [semantic, keyword] = await Promise.all([
    mode === 'keyword' ? Promise.resolve([]) : semanticSearch(options.userId, text, filters, pool),
    mode === 'semantic' ? Promise.resolve([]) : keywordSearch(options.userId, text, filters, pool),
  ]);

  const fused = fuse(semantic, keyword, text);
  const hits = options.groupBySource === false ? fused : collapse(fused);

  return {
    hits: hits.slice(0, limit),
    intent,
    mode,
    tookMs: Date.now() - started,
    counts: { semantic: semantic.length, keyword: keyword.length },
  };
}

/* ─────────────────────────────── retrievers ──────────────────────────── */

function buildFilterSql(
  filters: SearchFilters,
  params: unknown[],
): string {
  const clauses: string[] = [];
  if (filters.projectId) {
    params.push(filters.projectId);
    clauses.push(`s.project_id = $${params.length}`);
  }
  if (filters.kinds?.length) {
    params.push(filters.kinds);
    clauses.push(`s.kind = ANY($${params.length}::text[])`);
  }
  if (filters.sourceIds?.length) {
    params.push(filters.sourceIds);
    clauses.push(`s.id = ANY($${params.length}::text[])`);
  }
  if (filters.since) {
    params.push(filters.since.toISOString());
    clauses.push(`s.updated_at >= $${params.length}::timestamptz`);
  }
  if (filters.until) {
    params.push(filters.until.toISOString());
    clauses.push(`s.updated_at <= $${params.length}::timestamptz`);
  }
  return clauses.length ? `AND ${clauses.join(' AND ')}` : '';
}

const SELECT = `
  c.id           AS chunk_id,
  c.source_id    AS source_id,
  s.kind         AS kind,
  s.title        AS title,
  s.url          AS url,
  s.project_id   AS project_id,
  c.content      AS content,
  c.heading      AS heading,
  c.page         AS page,
  c.start_time   AS start_time,
  c.end_time     AS end_time,
  s.updated_at   AS updated_at`;

async function semanticSearch(
  userId: string,
  query: string,
  filters: SearchFilters,
  limit: number,
): Promise<Row[]> {
  if (!query.trim()) return [];
  const [vector] = await embeddingProvider().embed([query]);
  const params: unknown[] = [userId, `[${vector.join(',')}]`];
  const where = buildFilterSql(filters, params);
  params.push(limit);

  return rawQuery<Row>(
    `SELECT ${SELECT},
            1 - (e.embedding <=> $2::vector) AS score
       FROM embeddings e
       JOIN document_chunks c ON c.id = e.chunk_id
       JOIN sources s ON s.id = c.source_id
      WHERE e.user_id = $1
        AND s.deleted_at IS NULL
        ${where}
      ORDER BY e.embedding <=> $2::vector
      LIMIT $${params.length}`,
    params,
  );
}

async function keywordSearch(
  userId: string,
  query: string,
  filters: SearchFilters,
  limit: number,
): Promise<Row[]> {
  const terms = contentWords(query);
  if (!terms.length) return [];
  const tsquery = terms.map((t) => `${t}:*`).join(' | ');

  const params: unknown[] = [userId, tsquery];
  const where = buildFilterSql(filters, params);
  params.push(limit);

  try {
    return await rawQuery<Row>(
      `SELECT ${SELECT},
              ts_rank_cd(c.search_vector, to_tsquery('english', $2)) AS score
         FROM document_chunks c
         JOIN sources s ON s.id = c.source_id
        WHERE c.user_id = $1
          AND s.deleted_at IS NULL
          AND c.search_vector @@ to_tsquery('english', $2)
          ${where}
        ORDER BY score DESC
        LIMIT $${params.length}`,
      params,
    );
  } catch {
    // Fallback for databases where the generated tsvector is unavailable.
    const like = `%${terms[0]}%`;
    const p2: unknown[] = [userId, like];
    const w2 = buildFilterSql(filters, p2);
    p2.push(limit);
    return rawQuery<Row>(
      `SELECT ${SELECT}, 0.5 AS score
         FROM document_chunks c
         JOIN sources s ON s.id = c.source_id
        WHERE c.user_id = $1
          AND s.deleted_at IS NULL
          AND lower(c.content) LIKE $2
          ${w2}
        LIMIT $${p2.length}`,
      p2,
    );
  }
}

/* ─────────────────────────────── fusion ──────────────────────────────── */

const RRF_K = 60;

function fuse(semantic: Row[], keyword: Row[], query: string): SearchHit[] {
  const merged = new Map<
    string,
    { row: Row; rrf: number; semantic: number; keyword: number }
  >();

  semantic.forEach((row, i) => {
    merged.set(row.chunk_id, {
      row,
      rrf: 1 / (RRF_K + i + 1),
      semantic: Number(row.score) || 0,
      keyword: 0,
    });
  });
  keyword.forEach((row, i) => {
    const existing = merged.get(row.chunk_id);
    if (existing) {
      existing.rrf += 1 / (RRF_K + i + 1);
      existing.keyword = Number(row.score) || 0;
    } else {
      merged.set(row.chunk_id, {
        row,
        rrf: 1 / (RRF_K + i + 1),
        semantic: 0,
        keyword: Number(row.score) || 0,
      });
    }
  });

  const terms = new Set(contentStems(query));
  const now = Date.now();

  const hits = [...merged.values()].map(({ row, rrf, semantic: s, keyword: k }) => {
    const words = new Set(contentStems(row.content));
    let overlap = 0;
    for (const t of terms) if (words.has(t)) overlap++;
    const coverage = terms.size ? overlap / terms.size : 0;

    const ageDays = (now - new Date(row.updated_at).getTime()) / 86_400_000;
    const recency = 1 / (1 + Math.max(ageDays, 0) / 120);

    const score = rrf * 100 + coverage * 0.6 + recency * 0.12 + s * 0.2;

    return toHit(row, score, s, k, terms);
  });

  return hits.sort((a, b) => b.score - a.score);
}

function collapse(hits: SearchHit[]): SearchHit[] {
  const best = new Map<string, SearchHit>();
  for (const hit of hits) {
    const existing = best.get(hit.sourceId);
    if (!existing || hit.score > existing.score) best.set(hit.sourceId, hit);
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

function toHit(
  row: Row,
  score: number,
  semanticScore: number,
  keywordScore: number,
  terms: Set<string>,
): SearchHit {
  const citation: Citation = {
    sourceId: row.source_id,
    chunkId: row.chunk_id,
    title: row.title,
    kind: row.kind,
    page: row.page ?? undefined,
    time: row.start_time ?? undefined,
    section: row.heading ?? undefined,
    url: row.url ?? undefined,
    snippet: row.content.slice(0, 240),
  };

  return {
    chunkId: row.chunk_id,
    sourceId: row.source_id,
    sourceKind: row.kind,
    sourceTitle: row.title,
    sourceUrl: row.url,
    projectId: row.project_id,
    content: row.content,
    heading: row.heading,
    page: row.page,
    startTime: row.start_time,
    endTime: row.end_time,
    updatedAt: row.updated_at,
    score,
    semanticScore,
    keywordScore,
    citation,
    highlights: highlight(row.content, terms),
  };
}

/** Pick the sentences that actually contain query terms, for the snippet. */
function highlight(content: string, terms: Set<string>): string[] {
  if (!terms.size) return [content.slice(0, 200)];
  const sentences = content.split(/(?<=[.!?。！？])\s+/);
  const scored = sentences
    .map((sentence) => {
      const words = new Set(contentStems(sentence));
      let hits = 0;
      for (const t of terms) if (words.has(t)) hits++;
      return { sentence, hits };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 2)
    .map((s) => s.sentence.trim());
  return scored.length ? scored : [content.slice(0, 200)];
}

export { parseQueryIntent } from './intent';
export type { QueryIntent } from './intent';
