import 'server-only';

import { NextResponse } from 'next/server';
import { ZodError, type ZodTypeAny, type output } from 'zod';

import { UnauthorizedError } from '@/server/auth';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (m: string, d?: unknown) => new HttpError(400, m, d);
export const forbidden = (m = 'You do not have access to this resource.') =>
  new HttpError(403, m);
export const notFound = (m = 'Not found.') => new HttpError(404, m);

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** Uniform error envelope + status mapping for every route handler. */
export function toErrorResponse(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  if (error instanceof HttpError) {
    return NextResponse.json(
      { error: error.message, details: error.details },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: 'Invalid request.', details: error.flatten() },
      { status: 400 },
    );
  }
  const message = error instanceof Error ? error.message : 'Unexpected error.';
  if (process.env.NODE_ENV !== 'production') console.error('[api]', error);
  return NextResponse.json({ error: message }, { status: 500 });
}

type Handler<T> = () => Promise<T>;

/** Wrap a route body so every thrown error becomes a proper response. */
export async function route<T>(handler: Handler<T>) {
  try {
    const result = await handler();
    if (result instanceof Response) return result;
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function parseBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<output<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw badRequest('Request body must be valid JSON.');
  }
  return schema.parse(raw);
}

export function parseQuery<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): output<S> {
  const url = new URL(request.url);
  const entries: Record<string, string | string[]> = {};
  for (const key of new Set(url.searchParams.keys())) {
    const all = url.searchParams.getAll(key);
    entries[key] = all.length > 1 ? all : all[0];
  }
  return schema.parse(entries);
}
