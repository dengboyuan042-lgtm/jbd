import assert from 'node:assert/strict';
import test from 'node:test';

import { chunkSegments, chunkTranscript } from '../src/services/knowledge/chunking';
import { LocalEmbeddingProvider, cosineSimilarity } from '../src/services/ai/embeddings';
import { parseQueryIntent } from '../src/services/search/intent';
import { sm2, type SrsState } from '../src/services/study/srs';

test('chunking never spans a page boundary', () => {
  const chunks = chunkSegments([
    { text: 'Alpha one. Alpha two. Alpha three.', page: 1 },
    { text: 'Beta one. Beta two.', page: 2 },
  ]);
  assert.ok(chunks.length >= 2);
  for (const chunk of chunks) {
    const mentionsAlpha = chunk.content.includes('Alpha');
    const mentionsBeta = chunk.content.includes('Beta');
    assert.ok(!(mentionsAlpha && mentionsBeta), 'a chunk must belong to one page');
  }
});

test('chunking carries page and heading metadata', () => {
  const [chunk] = chunkSegments([
    { text: 'Only sentence here about vectors.', page: 7, heading: 'Vectors' },
  ]);
  assert.equal(chunk.page, 7);
  assert.equal(chunk.heading, 'Vectors');
  assert.ok(chunk.tokens > 0);
});

test('transcript chunking preserves time ranges', () => {
  const chunks = chunkTranscript([
    { text: 'First thing said.', start: 0, end: 4 },
    { text: 'Second thing said.', start: 4, end: 9 },
  ]);
  assert.equal(chunks[0].startTime, 0);
  assert.ok((chunks[0].endTime ?? 0) >= 9 || chunks.length > 1);
});

test('local embeddings are deterministic and normalised', async () => {
  const provider = new LocalEmbeddingProvider(768);
  const [a, b] = await provider.embed(['vector search', 'vector search']);
  assert.equal(a.length, 768);
  assert.ok(Math.abs(cosineSimilarity(a, b) - 1) < 1e-9);
  const norm = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  assert.ok(Math.abs(norm - 1) < 1e-6);
});

test('local embeddings rank related text above unrelated text', async () => {
  const provider = new LocalEmbeddingProvider(768);
  const [query, related, unrelated] = await provider.embed([
    'approximate nearest neighbour vector search',
    'dense retrieval uses nearest neighbour search over vectors',
    'the cat sat quietly on a warm windowsill',
  ]);
  assert.ok(
    cosineSimilarity(query, related) > cosineSimilarity(query, unrelated),
    'related text must score higher',
  );
});

test('query intent extracts relative time ranges', () => {
  const now = new Date('2026-03-15T12:00:00Z');
  const intent = parseQueryIntent('meetings last week about hiring', now);
  assert.ok(intent.since instanceof Date);
  assert.ok(intent.kinds?.includes('recording'));
  assert.ok(intent.applied.includes('past week'));
});

test('query intent leaves plain queries untouched', () => {
  const intent = parseQueryIntent('pgvector index rebuild');
  assert.equal(intent.since, null);
  assert.equal(intent.kinds, undefined);
  assert.equal(intent.text, 'pgvector index rebuild');
});

test('sm2 schedules a failed card immediately and a good card later', () => {
  const base = {
    repetitions: 2,
    easeFactor: 2.5,
    intervalDays: 6,
    dueAt: null,
    lastReviewedAt: null,
  };
  const now = new Date('2026-01-01T00:00:00Z');

  const failed = sm2.schedule(base, 0, now);
  assert.equal(failed.repetitions, 0);
  assert.ok(failed.dueAt!.getTime() - now.getTime() < 60 * 60 * 1000);

  const good = sm2.schedule(base, 4, now);
  assert.equal(good.repetitions, 3);
  assert.ok(good.intervalDays >= 6);
  assert.ok(good.dueAt!.getTime() > now.getTime());
});

test('sm2 ease factor never drops below the floor', () => {
  let state: SrsState = {
    repetitions: 0,
    easeFactor: 1.4,
    intervalDays: 0,
    dueAt: null,
    lastReviewedAt: null,
  };
  for (let i = 0; i < 10; i++) state = sm2.schedule(state, 0);
  assert.ok(state.easeFactor >= 1.3);
});
