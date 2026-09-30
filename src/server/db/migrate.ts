import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { rawQuery } from './client';

/**
 * Driver-agnostic migrator. Applies `drizzle/*.sql` (generated from the
 * Drizzle schema) in order, then the hand-written post-migration statements
 * that Drizzle cannot express (extensions, generated tsvector, GIN index).
 */

const POST_MIGRATION = [
  `ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS search_vector tsvector
     GENERATED ALWAYS AS (to_tsvector('english', content)) STORED`,
  `CREATE INDEX IF NOT EXISTS chunks_fts_idx ON document_chunks USING gin (search_vector)`,
  `CREATE INDEX IF NOT EXISTS sources_title_lower_idx ON sources (lower(title))`,
  `CREATE INDEX IF NOT EXISTS notes_title_lower_idx ON notes (lower(title))`,
];

let ran: Promise<void> | null = null;

export function migrate(): Promise<void> {
  ran ??= run();
  return ran;
}

async function run(): Promise<void> {
  await rawQuery(`CREATE EXTENSION IF NOT EXISTS vector`);
  await rawQuery(`CREATE TABLE IF NOT EXISTS __migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const applied = new Set(
    (await rawQuery<{ name: string }>(`SELECT name FROM __migrations`)).map(
      (r) => r.name,
    ),
  );

  const dir = path.join(process.cwd(), 'drizzle');
  let entries: string[] = [];
  try {
    entries = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    entries = [];
  }

  for (const file of entries) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    const statements = sql
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      try {
        await rawQuery(statement);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // Idempotency: re-running against an existing database is not fatal.
        if (/already exists|duplicate/i.test(message)) continue;
        throw new Error(`Migration ${file} failed: ${message}\n${statement}`);
      }
    }
    await rawQuery(`INSERT INTO __migrations (name) VALUES ($1)`, [file]);
  }

  for (const statement of POST_MIGRATION) {
    try {
      await rawQuery(statement);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/already exists|duplicate/i.test(message)) throw error;
    }
  }
}
