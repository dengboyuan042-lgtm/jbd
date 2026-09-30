import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { mindMaps } from '@/server/db/schema';
import { parseQuery, route } from '@/server/http';

const querySchema = z.object({ projectId: z.string().optional() });

export async function GET(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const params = parseQuery(request, querySchema);
    const db = await getDb();
    const conditions = [eq(mindMaps.userId, user.id), isNull(mindMaps.deletedAt)];
    if (params.projectId) conditions.push(eq(mindMaps.projectId, params.projectId));
    const rows = await db
      .select()
      .from(mindMaps)
      .where(and(...conditions))
      .orderBy(desc(mindMaps.updatedAt));
    return { mindMaps: rows };
  });
}
