import { and, eq } from 'drizzle-orm';

import { ids } from '@/lib/id';
import { getDb } from '@/server/db/client';
import {
  documentChunks,
  documents,
  embeddings,
  sources,
  type SourceKind,
} from '@/server/db/schema';
import { embeddingProvider } from '@/services/ai/embeddings';
import type { Chunk } from './chunking';

export type CreateSourceInput = {
  userId: string;
  projectId?: string | null;
  kind: SourceKind;
  title: string;
  refId?: string | null;
  url?: string | null;
  summary?: string | null;
  tags?: string[];
  metadata?: Record<string, unknown>;
};

export async function createSource(input: CreateSourceInput) {
  const db = await getDb();
  const [row] = await db
    .insert(sources)
    .values({
      id: ids.source(),
      userId: input.userId,
      projectId: input.projectId ?? null,
      kind: input.kind,
      title: input.title,
      refId: input.refId ?? null,
      url: input.url ?? null,
      summary: input.summary ?? null,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
    })
    .returning();
  return row;
}

export type IndexInput = {
  userId: string;
  sourceId: string;
  projectId?: string | null;
  documentId?: string | null;
  chunks: Chunk[];
  /** replace any previously indexed chunks for this source */
  replace?: boolean;
};

/**
 * Persist chunks and their vectors. Embedding happens in batches so a large
 * document does not hold a single request open or blow the provider's limits.
 */
export async function indexChunks(input: IndexInput): Promise<number> {
  const db = await getDb();
  const provider = embeddingProvider();

  if (input.replace) {
    await db
      .delete(documentChunks)
      .where(
        and(
          eq(documentChunks.sourceId, input.sourceId),
          eq(documentChunks.userId, input.userId),
        ),
      );
  }

  if (!input.chunks.length) return 0;

  const BATCH = 48;
  let written = 0;

  for (let i = 0; i < input.chunks.length; i += BATCH) {
    const batch = input.chunks.slice(i, i + BATCH);
    const rows = batch.map((chunk) => ({
      id: ids.chunk(),
      userId: input.userId,
      sourceId: input.sourceId,
      documentId: input.documentId ?? null,
      projectId: input.projectId ?? null,
      ordinal: chunk.ordinal,
      content: chunk.content,
      tokens: chunk.tokens,
      page: chunk.page ?? null,
      startTime: chunk.startTime ?? null,
      endTime: chunk.endTime ?? null,
      heading: chunk.heading ?? null,
      metadata: chunk.metadata,
    }));

    await db.insert(documentChunks).values(rows);

    const vectors = await provider.embed(batch.map((c) => c.content));
    await db.insert(embeddings).values(
      rows.map((row, j) => ({
        id: ids.embedding(),
        userId: input.userId,
        chunkId: row.id,
        sourceId: input.sourceId,
        projectId: input.projectId ?? null,
        model: provider.model,
        dimensions: provider.dimensions,
        embedding: vectors[j],
      })),
    );
    written += rows.length;
  }

  await db
    .update(sources)
    .set({ indexedAt: new Date(), updatedAt: new Date() })
    .where(eq(sources.id, input.sourceId));

  return written;
}

export type UpsertDocumentInput = {
  userId: string;
  sourceId: string;
  fileId?: string | null;
  parser: string;
  text: string;
  pageCount?: number;
  language?: string;
  outline?: { title: string; level: number; page?: number; offset?: number }[];
  metadata?: Record<string, unknown>;
};

export async function upsertDocument(input: UpsertDocumentInput) {
  const db = await getDb();
  const existing = await db.query.documents.findFirst({
    where: and(
      eq(documents.sourceId, input.sourceId),
      eq(documents.userId, input.userId),
    ),
  });

  const values = {
    userId: input.userId,
    sourceId: input.sourceId,
    fileId: input.fileId ?? null,
    parser: input.parser,
    text: input.text,
    pageCount: input.pageCount ?? null,
    wordCount: input.text.split(/\s+/).filter(Boolean).length,
    language: input.language ?? null,
    outline: input.outline ?? [],
    metadata: input.metadata ?? {},
    updatedAt: new Date(),
  };

  if (existing) {
    const [row] = await db
      .update(documents)
      .set(values)
      .where(eq(documents.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(documents)
    .values({ id: ids.document(), ...values })
    .returning();
  return row;
}

export async function deleteSourceIndex(userId: string, sourceId: string) {
  const db = await getDb();
  await db
    .delete(documentChunks)
    .where(
      and(eq(documentChunks.sourceId, sourceId), eq(documentChunks.userId, userId)),
    );
}
