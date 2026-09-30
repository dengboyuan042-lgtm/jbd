import { and, eq, isNull } from 'drizzle-orm';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { mindMaps } from '@/server/db/schema';
import { notFound, route } from '@/server/http';

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const db = await getDb();
    const map = await db.query.mindMaps.findFirst({
      where: and(eq(mindMaps.id, id), eq(mindMaps.userId, user.id), isNull(mindMaps.deletedAt)),
    });
    if (!map) throw notFound('Mind map not found.');
    return { mindMap: map };
  });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return route(async () => {
    const user = await requireUser();
    const { id } = await context.params;
    const db = await getDb();
    const map = await db.query.mindMaps.findFirst({
      where: and(eq(mindMaps.id, id), eq(mindMaps.userId, user.id)),
    });
    if (!map) throw notFound('Mind map not found.');
    await db.update(mindMaps).set({ deletedAt: new Date() }).where(eq(mindMaps.id, map.id));
    return { ok: true };
  });
}
