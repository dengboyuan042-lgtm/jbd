import { and, eq, isNull } from 'drizzle-orm';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { files, recordings } from '@/server/db/schema';
import { forbidden, notFound, toErrorResponse } from '@/server/http';
import { storage } from '@/services/storage';

/**
 * Authorised object access. The storage key is namespaced by user id, and we
 * additionally verify a row exists that the caller owns — so guessing a key
 * is not enough.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ key: string[] }> },
) {
  try {
    const user = await requireUser();
    const { key: parts } = await context.params;
    const key = parts.map(decodeURIComponent).join('/');

    if (!key.startsWith(`${user.id}/`)) throw forbidden();

    const db = await getDb();
    const file = await db.query.files.findFirst({
      where: and(
        eq(files.storageKey, key),
        eq(files.userId, user.id),
        isNull(files.deletedAt),
      ),
    });
    const recording = file
      ? null
      : await db.query.recordings.findFirst({
          where: and(
            eq(recordings.storageKey, key),
            eq(recordings.userId, user.id),
            isNull(recordings.deletedAt),
          ),
        });
    if (!file && !recording) throw notFound('Object not found.');

    const contentType =
      file?.mimeType ?? recording?.mimeType ?? 'application/octet-stream';
    const provider = storage();

    const rangeHeader = request.headers.get('range');
    if (rangeHeader) {
      const full = await provider.stream(key);
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) : full.size - 1;
      const { body } = await provider.stream(key, { start, end });
      return new Response(body, {
        status: 206,
        headers: {
          'content-type': contentType,
          'content-range': `bytes ${start}-${end}/${full.size}`,
          'accept-ranges': 'bytes',
          'content-length': String(end - start + 1),
          'cache-control': 'private, max-age=3600',
        },
      });
    }

    const { body, size } = await provider.stream(key);
    return new Response(body, {
      headers: {
        'content-type': contentType,
        'content-length': String(size),
        'accept-ranges': 'bytes',
        'cache-control': 'private, max-age=3600',
        'content-disposition': `inline; filename="${encodeURIComponent(
          file?.name ?? recording?.title ?? 'file',
        )}"`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
