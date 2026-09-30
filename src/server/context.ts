import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';

import { getDb } from '@/server/db/client';
import { documentChunks, memories, sources } from '@/server/db/schema';
import type { ContextDocument } from '@/services/ai/types';
import { estimateTokens } from '@/services/ai/nlp';
import { search } from '@/services/search';

export type BuildContextInput = {
  userId: string;
  query?: string;
  /** restrict retrieval to these sources */
  sourceIds?: string[];
  projectId?: string | null;
  /** hard cap on how much material is handed to the model */
  maxTokens?: number;
  maxDocuments?: number;
  /** pull whole sources rather than the best-matching chunks */
  whole?: boolean;
};

/**
 * Assemble grounding material with provenance.
 *
 * Retrieval is query-driven when there is a query, and ordinal-driven when a
 * specific source is being worked on (so "summarise this" sees the document
 * in reading order, not in relevance order).
 */
export async function buildContext(
  input: BuildContextInput,
): Promise<ContextDocument[]> {
  const maxTokens = input.maxTokens ?? 9_000;
  const maxDocuments = input.maxDocuments ?? 14;

  if (input.whole || !input.query?.trim()) {
    return wholeSourceContext(input, maxTokens, maxDocuments);
  }

  const { hits } = await search({
    userId: input.userId,
    query: input.query,
    projectId: input.projectId ?? undefined,
    sourceIds: input.sourceIds?.length ? input.sourceIds : undefined,
    limit: maxDocuments * 2,
    groupBySource: false,
  });

  const docs: ContextDocument[] = [];
  let tokens = 0;
  for (const hit of hits) {
    const cost = estimateTokens(hit.content);
    if (tokens + cost > maxTokens && docs.length) break;
    docs.push({
      id: hit.chunkId,
      title: hit.sourceTitle,
      content: hit.content,
      citation: hit.citation,
    });
    tokens += cost;
    if (docs.length >= maxDocuments) break;
  }

  // A focused source must always contribute, even if lexically distant.
  if (!docs.length && input.sourceIds?.length) {
    return wholeSourceContext(input, maxTokens, maxDocuments);
  }
  return docs;
}

async function wholeSourceContext(
  input: BuildContextInput,
  maxTokens: number,
  maxDocuments: number,
): Promise<ContextDocument[]> {
  const db = await getDb();

  let sourceIds = input.sourceIds ?? [];
  if (!sourceIds.length) {
    const conditions = [eq(sources.userId, input.userId), isNull(sources.deletedAt)];
    if (input.projectId) conditions.push(eq(sources.projectId, input.projectId));
    const recent = await db
      .select({ id: sources.id })
      .from(sources)
      .where(and(...conditions))
      .orderBy(desc(sources.updatedAt))
      .limit(6);
    sourceIds = recent.map((r) => r.id);
  }
  if (!sourceIds.length) return [];

  const owned = await db
    .select()
    .from(sources)
    .where(
      and(
        inArray(sources.id, sourceIds),
        eq(sources.userId, input.userId),
        isNull(sources.deletedAt),
      ),
    );
  const titleById = new Map(owned.map((s) => [s.id, s]));
  const allowed = owned.map((s) => s.id);
  if (!allowed.length) return [];

  const chunks = await db
    .select()
    .from(documentChunks)
    .where(
      and(
        inArray(documentChunks.sourceId, allowed),
        eq(documentChunks.userId, input.userId),
      ),
    )
    .orderBy(asc(documentChunks.sourceId), asc(documentChunks.ordinal))
    .limit(600);

  // Spread the budget evenly so one long document cannot crowd out the rest.
  const perSource = Math.max(1, Math.floor(maxDocuments / allowed.length));
  const bySource = new Map<string, typeof chunks>();
  for (const chunk of chunks) {
    const list = bySource.get(chunk.sourceId) ?? [];
    if (list.length < Math.max(perSource, 3)) list.push(chunk);
    bySource.set(chunk.sourceId, list);
  }

  const docs: ContextDocument[] = [];
  let tokens = 0;
  for (const [sourceId, list] of bySource) {
    const source = titleById.get(sourceId);
    if (!source) continue;
    for (const chunk of list) {
      const cost = estimateTokens(chunk.content);
      if (tokens + cost > maxTokens && docs.length) break;
      docs.push({
        id: chunk.id,
        title: source.title,
        content: chunk.content,
        citation: {
          sourceId,
          chunkId: chunk.id,
          title: source.title,
          kind: source.kind,
          page: chunk.page ?? undefined,
          time: chunk.startTime ?? undefined,
          section: chunk.heading ?? undefined,
          url: source.url ?? undefined,
          snippet: chunk.content.slice(0, 240),
        },
      });
      tokens += cost;
    }
  }
  return docs;
}

/** Long-lived facts the assistant should always keep in view. */
export async function buildMemoryPrompt(
  userId: string,
  projectId?: string | null,
): Promise<string> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(memories)
    .where(and(eq(memories.userId, userId), isNull(memories.deletedAt)))
    .orderBy(desc(memories.pinned), desc(memories.updatedAt))
    .limit(60);

  const relevant = rows.filter(
    (m) => m.scope === 'user' || (projectId && m.projectId === projectId),
  );
  if (!relevant.length) return '';

  const userFacts = relevant.filter((m) => m.scope === 'user');
  const projectFacts = relevant.filter((m) => m.scope === 'project');

  const lines: string[] = [];
  if (userFacts.length) {
    lines.push('About the person you are helping:');
    lines.push(...userFacts.slice(0, 20).map((m) => `- ${m.key}: ${m.value}`));
  }
  if (projectFacts.length) {
    lines.push('', 'About the current project:');
    lines.push(...projectFacts.slice(0, 20).map((m) => `- ${m.key}: ${m.value}`));
  }
  return lines.join('\n');
}
