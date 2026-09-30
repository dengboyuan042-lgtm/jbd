import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import {
  chats,
  notes,
  projects,
  sourceKinds,
  sources,
  type SourceKind,
} from '@/server/db/schema';
import { parseQuery, route } from '@/server/http';
import { search } from '@/services/search';

const querySchema = z.object({
  q: z.string().default(''),
  mode: z.enum(['hybrid', 'semantic', 'keyword']).default('hybrid'),
  projectId: z.string().optional(),
  kind: z
    .union([z.enum(sourceKinds), z.array(z.enum(sourceKinds))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  /** include entity matches (projects, notes, chats) for the command palette */
  entities: z.enum(['0', '1']).default('1'),
});

export async function GET(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const params = parseQuery(request, querySchema);
    const db = await getDb();
    const q = params.q.trim();

    if (!q) {
      const recent = await db
        .select()
        .from(sources)
        .where(and(eq(sources.userId, user.id), isNull(sources.deletedAt)))
        .orderBy(desc(sources.updatedAt))
        .limit(8);
      return {
        query: q,
        hits: [],
        entities: { sources: recent, projects: [], notes: [], chats: [] },
        intent: null,
        tookMs: 0,
      };
    }

    const content = await search({
      userId: user.id,
      query: q,
      mode: params.mode,
      projectId: params.projectId,
      kinds: params.kind as SourceKind[] | undefined,
      limit: params.limit,
    });

    if (params.entities === '0') {
      return { query: q, ...content, entities: null };
    }

    const like = `%${q.toLowerCase()}%`;
    const [matchedSources, matchedProjects, matchedNotes, matchedChats] =
      await Promise.all([
        db
          .select()
          .from(sources)
          .where(
            and(
              eq(sources.userId, user.id),
              isNull(sources.deletedAt),
              sql`lower(${sources.title}) LIKE ${like}`,
            ),
          )
          .orderBy(desc(sources.updatedAt))
          .limit(6),
        db
          .select()
          .from(projects)
          .where(
            and(
              eq(projects.userId, user.id),
              isNull(projects.deletedAt),
              or(
                sql`lower(${projects.name}) LIKE ${like}`,
                sql`lower(coalesce(${projects.description}, '')) LIKE ${like}`,
              ),
            ),
          )
          .limit(5),
        db
          .select()
          .from(notes)
          .where(
            and(
              eq(notes.userId, user.id),
              isNull(notes.deletedAt),
              sql`lower(${notes.title}) LIKE ${like}`,
            ),
          )
          .orderBy(desc(notes.updatedAt))
          .limit(5),
        db
          .select()
          .from(chats)
          .where(
            and(
              eq(chats.userId, user.id),
              isNull(chats.deletedAt),
              sql`lower(${chats.title}) LIKE ${like}`,
            ),
          )
          .orderBy(desc(chats.updatedAt))
          .limit(5),
      ]);

    return {
      query: q,
      ...content,
      entities: {
        sources: matchedSources,
        projects: matchedProjects,
        notes: matchedNotes,
        chats: matchedChats,
      },
    };
  });
}
