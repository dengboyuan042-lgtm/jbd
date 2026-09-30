import { env } from '@/lib/env';
import * as schema from './schema';

/**
 * Two interchangeable Postgres drivers behind one handle:
 *
 *  • `pglite`   — embedded Postgres (WASM) with pgvector. Zero infrastructure,
 *                 used for local development and CI.
 *  • `postgres` — a real Postgres server (Neon / RDS / Supabase / self-hosted).
 *
 * Both speak the same dialect, so application code never branches on driver.
 */

export type Database = Awaited<ReturnType<typeof createDatabase>>['db'];

type Handle = {
  db: unknown;
  close: () => Promise<void>;
  raw: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
};

async function createDatabase() {
  const e = env();

  if (e.DATABASE_DRIVER === 'postgres') {
    const { Pool } = await import('pg');
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const pool = new Pool({ connectionString: e.DATABASE_URL });
    const db = drizzle(pool, { schema, casing: 'snake_case' });
    return {
      db,
      close: () => pool.end(),
      raw: async (sql: string, params: unknown[] = []) => {
        const res = await pool.query(sql, params);
        return { rows: res.rows as unknown[] };
      },
    };
  }

  const { PGlite } = await import('@electric-sql/pglite');
  const { vector } = await import('@electric-sql/pglite/vector');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { mkdirSync } = await import('node:fs');
  const nodePath = await import('node:path');

  const dataDir = nodePath.resolve(process.cwd(), e.PGLITE_DATA_DIR);
  mkdirSync(dataDir, { recursive: true });

  const client = new PGlite(dataDir, {
    extensions: { vector },
  });
  await client.waitReady;
  const db = drizzle(client, { schema, casing: 'snake_case' });
  return {
    db,
    close: () => client.close(),
    raw: async (sql: string, params: unknown[] = []) => {
      const res = await client.query(sql, params);
      return { rows: res.rows as unknown[] };
    },
  };
}

/* PGlite is single-process; reuse the handle across HMR reloads. */
const globalForDb = globalThis as unknown as {
  __dbHandle?: Promise<Handle>;
};

function handle(): Promise<Handle> {
  globalForDb.__dbHandle ??= createDatabase() as unknown as Promise<Handle>;
  return globalForDb.__dbHandle;
}

export async function getDb(): Promise<Database> {
  const h = await handle();
  return h.db as Database;
}

/** Escape hatch for SQL features Drizzle does not model (vector ops, FTS). */
export async function rawQuery<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const h = await handle();
  const res = await h.raw(sql, params);
  return res.rows as T[];
}

export { schema };
