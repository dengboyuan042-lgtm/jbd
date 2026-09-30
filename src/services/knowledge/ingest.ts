import { and, eq } from 'drizzle-orm';

import { ids } from '@/lib/id';
import { getDb } from '@/server/db/client';
import {
  activities,
  files as filesTable,
  recordings as recordingsTable,
  sources,
  transcriptSegments,
  transcripts,
  type SourceKind,
} from '@/server/db/schema';
import { ai } from '@/services/ai';
import { extractiveSummary, keywords } from '@/services/ai/nlp';
import { storage, storageKey } from '@/services/storage';
import { chunkSegments, chunkTranscript, type Chunk } from './chunking';
import { createSource, indexChunks, upsertDocument } from './indexer';
import { MEDIA_EXTENSIONS, parseDocument, parserFor } from './parsers';
import { importUrl } from './web';

export type IngestResult = {
  sourceId: string;
  title: string;
  kind: SourceKind;
  chunks: number;
  summary: string | null;
  warning?: string;
};

/* ─────────────────────────────── files ──────────────────────────────── */

export async function ingestFile(input: {
  userId: string;
  projectId?: string | null;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<IngestResult> {
  const db = await getDb();
  const fileId = ids.file();
  const extension = (input.filename.split('.').pop() ?? '').toLowerCase();
  const key = storageKey(input.userId, 'files', fileId, input.filename);

  const stored = await storage().put({
    key,
    body: input.buffer,
    contentType: input.mimeType || 'application/octet-stream',
  });

  const isMedia =
    MEDIA_EXTENSIONS.includes(extension) ||
    input.mimeType.startsWith('audio/') ||
    input.mimeType.startsWith('video/');

  const source = await createSource({
    userId: input.userId,
    projectId: input.projectId ?? null,
    kind: 'file',
    title: input.filename.replace(/\.[^.]+$/, ''),
    refId: fileId,
    metadata: { extension, mimeType: input.mimeType, size: stored.size, isMedia },
  });

  await db.insert(filesTable).values({
    id: fileId,
    userId: input.userId,
    projectId: input.projectId ?? null,
    sourceId: source.id,
    name: input.filename,
    mimeType: input.mimeType || 'application/octet-stream',
    extension,
    size: stored.size,
    storageKey: key,
    checksum: stored.checksum,
    status: 'processing',
  });

  try {
    if (isMedia) {
      await db
        .update(filesTable)
        .set({ status: 'ready', updatedAt: new Date() })
        .where(eq(filesTable.id, fileId));
      await logActivity(input.userId, {
        kind: 'file.upload',
        title: input.filename,
        href: `/library/${source.id}`,
        projectId: input.projectId ?? null,
      });
      return {
        sourceId: source.id,
        title: source.title,
        kind: 'file',
        chunks: 0,
        summary: null,
        warning:
          'Media file stored. Run transcription to make its contents searchable.',
      };
    }

    if (!parserFor(input.filename, input.mimeType)) {
      throw new Error(`Unsupported file type: .${extension}`);
    }

    const parsed = await parseDocument({
      buffer: input.buffer,
      filename: input.filename,
      mimeType: input.mimeType,
    });

    const document = await upsertDocument({
      userId: input.userId,
      sourceId: source.id,
      fileId,
      parser: parsed.parser,
      text: parsed.text,
      pageCount: parsed.pageCount,
      language: parsed.language,
      outline: parsed.outline,
      metadata: parsed.metadata,
    });

    const chunks = chunkSegments(
      parsed.pages.map((p) => ({ text: p.text, page: p.page, heading: p.heading })),
    );

    const count = await indexChunks({
      userId: input.userId,
      sourceId: source.id,
      projectId: input.projectId ?? null,
      documentId: document.id,
      chunks,
      replace: true,
    });

    const summary = await autoSummarise(parsed.text);
    await db
      .update(sources)
      .set({
        summary,
        tags: keywords(parsed.text, 5).map((k) => k.item),
        metadata: {
          extension,
          mimeType: input.mimeType,
          size: stored.size,
          pageCount: parsed.pageCount,
          language: parsed.language,
        },
        updatedAt: new Date(),
      })
      .where(eq(sources.id, source.id));

    await db
      .update(filesTable)
      .set({ status: 'ready', updatedAt: new Date() })
      .where(eq(filesTable.id, fileId));

    await logActivity(input.userId, {
      kind: 'file.upload',
      title: input.filename,
      href: `/library/${source.id}`,
      projectId: input.projectId ?? null,
    });

    return { sourceId: source.id, title: source.title, kind: 'file', chunks: count, summary };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Processing failed.';
    await db
      .update(filesTable)
      .set({ status: 'failed', error: message, updatedAt: new Date() })
      .where(eq(filesTable.id, fileId));
    throw error;
  }
}

/* ─────────────────────────────── urls ───────────────────────────────── */

export async function ingestUrl(input: {
  userId: string;
  projectId?: string | null;
  url: string;
}): Promise<IngestResult> {
  const db = await getDb();
  const imported = await importUrl(input.url);

  const source = await createSource({
    userId: input.userId,
    projectId: input.projectId ?? null,
    kind: imported.kind,
    title: imported.title,
    url: imported.url,
    metadata: {
      siteName: imported.siteName,
      author: imported.author,
      publishedAt: imported.publishedAt,
      ...imported.metadata,
    },
  });

  const document = await upsertDocument({
    userId: input.userId,
    sourceId: source.id,
    parser: imported.parser,
    text: imported.text,
    pageCount: imported.pageCount,
    language: imported.language,
    outline: imported.outline,
    metadata: imported.metadata,
  });

  const chunks: Chunk[] = imported.cues
    ? chunkTranscript(
        imported.cues.map((c) => ({ text: c.text, start: c.start, end: c.end })),
      )
    : chunkSegments(
        imported.pages.map((p) => ({ text: p.text, page: p.page, heading: p.heading })),
      );

  const count = await indexChunks({
    userId: input.userId,
    sourceId: source.id,
    projectId: input.projectId ?? null,
    documentId: document.id,
    chunks,
    replace: true,
  });

  const summary = await autoSummarise(imported.text);
  await db
    .update(sources)
    .set({
      summary,
      tags: keywords(imported.text, 5).map((k) => k.item),
      updatedAt: new Date(),
    })
    .where(eq(sources.id, source.id));

  await logActivity(input.userId, {
    kind: imported.kind === 'youtube' ? 'youtube.import' : 'web.import',
    title: imported.title,
    href: `/library/${source.id}`,
    projectId: input.projectId ?? null,
  });

  return {
    sourceId: source.id,
    title: imported.title,
    kind: imported.kind,
    chunks: count,
    summary,
  };
}

/* ─────────────────────────── recordings ─────────────────────────────── */

export type TranscriptInput = {
  segments: {
    start: number;
    end: number;
    text: string;
    speaker?: string;
    confidence?: number;
    language?: string;
  }[];
  language?: string;
  provider: string;
  durationSec: number;
};

/** Persist a transcript (from live capture or a hosted ASR run) and index it. */
export async function ingestTranscript(input: {
  userId: string;
  recordingId: string;
  transcript: TranscriptInput;
}): Promise<IngestResult> {
  const db = await getDb();

  const recording = await db.query.recordings.findFirst({
    where: and(
      eq(recordingsTable.id, input.recordingId),
      eq(recordingsTable.userId, input.userId),
    ),
  });
  if (!recording) throw new Error('Recording not found.');

  let sourceId = recording.sourceId;
  if (!sourceId) {
    const source = await createSource({
      userId: input.userId,
      projectId: recording.projectId,
      kind: 'recording',
      title: recording.title,
      refId: recording.id,
      metadata: { durationSec: input.transcript.durationSec },
    });
    sourceId = source.id;
    await db
      .update(recordingsTable)
      .set({ sourceId })
      .where(eq(recordingsTable.id, recording.id));
  }

  const fullText = input.transcript.segments.map((s) => s.text).join(' ');

  await db
    .delete(transcripts)
    .where(
      and(
        eq(transcripts.recordingId, recording.id),
        eq(transcripts.userId, input.userId),
      ),
    );

  const [transcript] = await db
    .insert(transcripts)
    .values({
      id: ids.transcript(),
      userId: input.userId,
      recordingId: recording.id,
      sourceId,
      provider: input.transcript.provider,
      language: input.transcript.language ?? null,
      text: fullText,
      wordCount: fullText.split(/\s+/).filter(Boolean).length,
    })
    .returning();

  const speakerLabels = [
    ...new Set(input.transcript.segments.map((s) => s.speaker).filter(Boolean)),
  ] as string[];
  const speakerRows = speakerLabels.map((label, i) => ({
    id: ids.speaker(),
    userId: input.userId,
    transcriptId: transcript.id,
    label,
    displayName: label,
    color: ['indigo', 'emerald', 'amber', 'rose', 'sky', 'violet'][i % 6],
  }));
  if (speakerRows.length) {
    const { speakers } = await import('@/server/db/schema');
    await db.insert(speakers).values(speakerRows);
  }
  const speakerIdByLabel = new Map(speakerRows.map((s) => [s.label, s.id]));

  if (input.transcript.segments.length) {
    await db.insert(transcriptSegments).values(
      input.transcript.segments.map((s, i) => ({
        id: ids.segment(),
        userId: input.userId,
        transcriptId: transcript.id,
        speakerId: s.speaker ? (speakerIdByLabel.get(s.speaker) ?? null) : null,
        ordinal: i,
        startTime: s.start,
        endTime: s.end,
        text: s.text,
        confidence: s.confidence ?? null,
        language: s.language ?? null,
      })),
    );
  }

  const document = await upsertDocument({
    userId: input.userId,
    sourceId,
    parser: 'transcript',
    text: fullText,
    language: input.transcript.language,
    metadata: { durationSec: input.transcript.durationSec, provider: input.transcript.provider },
  });

  const chunks = chunkTranscript(input.transcript.segments);
  const count = await indexChunks({
    userId: input.userId,
    sourceId,
    projectId: recording.projectId,
    documentId: document.id,
    chunks,
    replace: true,
  });

  const summary = await autoSummarise(fullText);
  await db
    .update(sources)
    .set({ summary, tags: keywords(fullText, 5).map((k) => k.item), updatedAt: new Date() })
    .where(eq(sources.id, sourceId));

  await db
    .update(recordingsTable)
    .set({
      status: 'ready',
      durationSec: input.transcript.durationSec || recording.durationSec,
      language: input.transcript.language ?? recording.language,
      updatedAt: new Date(),
    })
    .where(eq(recordingsTable.id, recording.id));

  await logActivity(input.userId, {
    kind: 'recording.transcribed',
    title: recording.title,
    href: `/record/${recording.id}`,
    projectId: recording.projectId,
  });

  return {
    sourceId,
    title: recording.title,
    kind: 'recording',
    chunks: count,
    summary,
  };
}

/* ─────────────────────────────── notes ──────────────────────────────── */

/** Notes are indexed on save so they participate in search and citations. */
export async function indexNote(input: {
  userId: string;
  noteId: string;
  title: string;
  content: string;
  projectId?: string | null;
}): Promise<string> {
  const db = await getDb();
  let source = await db.query.sources.findFirst({
    where: and(eq(sources.refId, input.noteId), eq(sources.userId, input.userId)),
  });

  if (!source) {
    source = await createSource({
      userId: input.userId,
      projectId: input.projectId ?? null,
      kind: 'note',
      title: input.title,
      refId: input.noteId,
    });
  } else {
    await db
      .update(sources)
      .set({
        title: input.title,
        projectId: input.projectId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(sources.id, source.id));
  }

  const document = await upsertDocument({
    userId: input.userId,
    sourceId: source.id,
    parser: 'markdown',
    text: input.content,
  });

  const sections = splitMarkdownSections(input.content);
  const chunks = chunkSegments(sections);

  await indexChunks({
    userId: input.userId,
    sourceId: source.id,
    projectId: input.projectId ?? null,
    documentId: document.id,
    chunks,
    replace: true,
  });

  return source.id;
}

function splitMarkdownSections(markdown: string) {
  const lines = markdown.split('\n');
  const sections: { text: string; heading?: string; page: number }[] = [];
  let heading: string | undefined;
  let buffer: string[] = [];
  const flush = () => {
    const text = buffer.join('\n').trim();
    if (text) sections.push({ text, heading, page: sections.length + 1 });
    buffer = [];
  };
  for (const line of lines) {
    const match = line.match(/^(#{1,4})\s+(.+)$/);
    if (match) {
      flush();
      heading = match[2].trim();
      buffer.push(line);
    } else {
      buffer.push(line);
    }
  }
  flush();
  return sections.length ? sections : [{ text: markdown, page: 1 }];
}

/* ─────────────────────────────── helpers ────────────────────────────── */

async function autoSummarise(text: string): Promise<string | null> {
  const trimmed = text.trim();
  if (trimmed.length < 200) return null;
  try {
    const result = await ai.summarize(trimmed.slice(0, 24_000), 'brief');
    return result.slice(0, 900);
  } catch {
    return extractiveSummary(trimmed, 2).join(' ').slice(0, 900) || null;
  }
}

export async function logActivity(
  userId: string,
  input: {
    kind: string;
    title: string;
    href?: string | null;
    projectId?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  const db = await getDb();
  await db.insert(activities).values({
    id: ids.activity(),
    userId,
    projectId: input.projectId ?? null,
    kind: input.kind,
    title: input.title,
    href: input.href ?? null,
    metadata: input.metadata ?? {},
  });
}
