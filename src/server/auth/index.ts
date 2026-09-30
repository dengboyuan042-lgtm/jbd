import 'server-only';

import { cookies } from 'next/headers';
import { and, eq, gt, isNull } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

import { env } from '@/lib/env';
import { getDb } from '@/server/db/client';
import { migrate } from '@/server/db/migrate';
import { sessions, users } from '@/server/db/schema';
import { ids } from '@/lib/id';

const COOKIE = 'ws_session';
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  locale: string;
  settings: Record<string, unknown>;
};

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createUser(input: {
  email: string;
  name: string;
  password: string;
}): Promise<AuthUser> {
  await migrate();
  const db = await getDb();
  const email = input.email.trim().toLowerCase();
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) throw new AuthError('An account with that email already exists.');

  const [row] = await db
    .insert(users)
    .values({
      id: ids.user(),
      email,
      name: input.name.trim() || email.split('@')[0],
      passwordHash: await hashPassword(input.password),
    })
    .returning();

  return toAuthUser(row);
}

export async function authenticate(
  email: string,
  password: string,
): Promise<AuthUser> {
  await migrate();
  const db = await getDb();
  const row = await db.query.users.findFirst({
    where: and(eq(users.email, email.trim().toLowerCase()), isNull(users.deletedAt)),
  });
  if (!row) throw new AuthError('Incorrect email or password.');
  const ok = await verifyPassword(password, row.passwordHash);
  if (!ok) throw new AuthError('Incorrect email or password.');
  return toAuthUser(row);
}

export async function startSession(userId: string, userAgent?: string) {
  const db = await getDb();
  const sessionId = ids.session();
  const expiresAt = new Date(Date.now() + MAX_AGE_SEC * 1000);
  await db.insert(sessions).values({ id: sessionId, userId, expiresAt, userAgent });
  const jar = await cookies();
  const sameSite = env().COOKIE_SAMESITE;
  jar.set(COOKIE, sessionId, {
    httpOnly: true,
    sameSite,
    // SameSite=None is only honoured on secure cookies.
    secure: sameSite === 'none' || process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SEC,
  });
  return sessionId;
}

export async function endSession() {
  const jar = await cookies();
  const sessionId = jar.get(COOKIE)?.value;
  if (sessionId) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }
  jar.delete(COOKIE);
}

/** Resolve the signed-in user, or null. Never throws. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const jar = await cookies();
    const sessionId = jar.get(COOKIE)?.value;
    if (!sessionId) return null;
    await migrate();
    const db = await getDb();
    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())),
    });
    if (!session) return null;
    const row = await db.query.users.findFirst({
      where: and(eq(users.id, session.userId), isNull(users.deletedAt)),
    });
    return row ? toAuthUser(row) : null;
  } catch {
    return null;
  }
}

/** Use inside API routes / server actions. Throws 401-shaped error. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

function toAuthUser(row: typeof users.$inferSelect): AuthUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarUrl: row.avatarUrl,
    locale: row.locale,
    settings: (row.settings ?? {}) as Record<string, unknown>,
  };
}

export class AuthError extends Error {
  readonly status = 400;
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super('Authentication required.');
  }
}
