import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { ids } from '@/lib/id';
import { getDb } from '@/server/db/client';
import {
  documentChunks,
  notes,
  projects,
  recordings,
  sources,
  tasks,
} from '@/server/db/schema';
import { indexNote, ingestUrl, logActivity } from '@/services/knowledge/ingest';
import { search } from '@/services/search';
import { runTool } from '@/services/tools';
import type { ToolDefinition } from '@/services/ai/types';

export type AgentContext = {
  userId: string;
  projectId?: string | null;
  /** sources the user had in view when they asked */
  focusSourceIds?: string[];
};

export type AgentToolResult = {
  /** compact text handed back to the model */
  summary: string;
  /** structured payload surfaced in the UI */
  data?: unknown;
  /** things the run produced, shown as result cards */
  artifacts?: { kind: string; id: string; title: string; href: string }[];
};

export type AgentTool = {
  definition: ToolDefinition;
  /** short present-tense label shown while running */
  running: (args: Record<string, unknown>) => string;
  run: (
    args: Record<string, unknown>,
    context: AgentContext,
  ) => Promise<AgentToolResult>;
};

const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' ? v : fallback;
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const arr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/* ───────────────────────────── tool registry ─────────────────────────── */

export const AGENT_TOOLS: Record<string, AgentTool> = {
  search_knowledge: {
    definition: {
      name: 'search_knowledge',
      description:
        'Search everything the user has: files, notes, recordings, web pages, videos. Supports natural-language time filters. Use this first when the request refers to existing material.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'What to look for.' },
          kinds: {
            type: 'array',
            items: { type: 'string', enum: ['file', 'note', 'recording', 'webpage', 'youtube', 'chat'] },
          },
          limit: { type: 'number', default: 10 },
        },
        required: ['query'],
      },
    },
    running: (args) => `Searching for “${str(args.query)}”`,
    async run(args, context) {
      const result = await search({
        userId: context.userId,
        query: str(args.query),
        projectId: context.projectId ?? undefined,
        kinds: arr(args.kinds).length ? (arr(args.kinds) as never) : undefined,
        limit: num(args.limit, 10),
      });
      return {
        summary: result.hits.length
          ? result.hits
              .map(
                (h, i) =>
                  `${i + 1}. ${h.sourceTitle} [${h.sourceId}] — ${h.highlights[0]?.slice(0, 180) ?? ''}`,
              )
              .join('\n')
          : 'No matching material.',
        data: {
          hits: result.hits.map((h) => ({
            sourceId: h.sourceId,
            title: h.sourceTitle,
            kind: h.sourceKind,
            snippet: h.highlights[0] ?? '',
            page: h.page,
            time: h.startTime,
          })),
          applied: result.intent.applied,
        },
      };
    },
  },

  list_sources: {
    definition: {
      name: 'list_sources',
      description:
        'List the user\'s most recent sources, optionally filtered by kind. Use when the request is about "my last N meetings/documents" rather than a topic.',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['file', 'note', 'recording', 'webpage', 'youtube', 'chat'],
          },
          limit: { type: 'number', default: 5 },
        },
      },
    },
    running: (args) => `Listing recent ${str(args.kind, 'items')}`,
    async run(args, context) {
      const db = await getDb();
      const conditions = [eq(sources.userId, context.userId), isNull(sources.deletedAt)];
      if (args.kind) conditions.push(eq(sources.kind, str(args.kind) as never));
      if (context.projectId) conditions.push(eq(sources.projectId, context.projectId));

      const rows = await db
        .select()
        .from(sources)
        .where(and(...conditions))
        .orderBy(desc(sources.updatedAt))
        .limit(num(args.limit, 5));

      return {
        summary: rows.length
          ? rows.map((r, i) => `${i + 1}. ${r.title} [${r.id}] (${r.kind})`).join('\n')
          : 'Nothing found.',
        data: { sources: rows.map((r) => ({ id: r.id, title: r.title, kind: r.kind })) },
      };
    },
  },

  read_document: {
    definition: {
      name: 'read_document',
      description:
        'Read the contents of one source by id. Returns text with page or timestamp markers so it can be cited.',
      parameters: {
        type: 'object',
        properties: {
          sourceId: { type: 'string' },
          maxChars: { type: 'number', default: 8000 },
        },
        required: ['sourceId'],
      },
    },
    running: () => 'Reading source',
    async run(args, context) {
      const db = await getDb();
      const sourceId = str(args.sourceId);
      const source = await db.query.sources.findFirst({
        where: and(
          eq(sources.id, sourceId),
          eq(sources.userId, context.userId),
          isNull(sources.deletedAt),
        ),
      });
      if (!source) return { summary: `No source with id ${sourceId}.` };

      const chunks = await db
        .select()
        .from(documentChunks)
        .where(
          and(
            eq(documentChunks.sourceId, sourceId),
            eq(documentChunks.userId, context.userId),
          ),
        )
        .orderBy(documentChunks.ordinal)
        .limit(120);

      const maxChars = num(args.maxChars, 8000);
      let text = '';
      for (const chunk of chunks) {
        const marker = chunk.page
          ? `[p.${chunk.page}] `
          : chunk.startTime != null
            ? `[${Math.floor(chunk.startTime / 60)}:${String(Math.floor(chunk.startTime % 60)).padStart(2, '0')}] `
            : '';
        if (text.length + chunk.content.length > maxChars) break;
        text += `${marker}${chunk.content}\n\n`;
      }

      return {
        summary: `${source.title}\n\n${text.trim() || '(no indexed text)'}`,
        data: { sourceId, title: source.title, kind: source.kind },
      };
    },
  },

  create_note: {
    definition: {
      name: 'create_note',
      description: 'Create a note in the workspace. Content is Markdown.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string' },
          projectId: { type: 'string' },
        },
        required: ['title', 'content'],
      },
    },
    running: (args) => `Writing “${str(args.title, 'note')}”`,
    async run(args, context) {
      const db = await getDb();
      const noteId = ids.note();
      const projectId = str(args.projectId) || context.projectId || null;
      const title = str(args.title, 'Untitled');
      const content = str(args.content);

      await db.insert(notes).values({
        id: noteId,
        userId: context.userId,
        projectId,
        title,
        content,
        origin: { agent: true },
      });
      const sourceId = await indexNote({
        userId: context.userId,
        noteId,
        title,
        content,
        projectId,
      });
      await db.update(notes).set({ sourceId }).where(eq(notes.id, noteId));
      await logActivity(context.userId, {
        kind: 'agent.note',
        title,
        href: `/notes/${noteId}`,
        projectId,
      });

      return {
        summary: `Created note "${title}" (${noteId}).`,
        artifacts: [{ kind: 'note', id: noteId, title, href: `/notes/${noteId}` }],
      };
    },
  },

  create_project: {
    definition: {
      name: 'create_project',
      description: 'Create a project workspace to group material.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          goal: { type: 'string' },
          sourceIds: { type: 'array', items: { type: 'string' } },
        },
        required: ['name'],
      },
    },
    running: (args) => `Creating project “${str(args.name)}”`,
    async run(args, context) {
      const db = await getDb();
      const [project] = await db
        .insert(projects)
        .values({
          id: ids.project(),
          userId: context.userId,
          name: str(args.name, 'Untitled project'),
          description: str(args.description) || null,
          goal: str(args.goal) || null,
        })
        .returning();

      const sourceIds = arr(args.sourceIds);
      if (sourceIds.length) {
        await db
          .update(sources)
          .set({ projectId: project.id, updatedAt: new Date() })
          .where(
            and(inArray(sources.id, sourceIds), eq(sources.userId, context.userId)),
          );
      }

      return {
        summary: `Created project "${project.name}" (${project.id}) with ${sourceIds.length} source(s).`,
        artifacts: [
          {
            kind: 'project',
            id: project.id,
            title: project.name,
            href: `/projects/${project.id}`,
          },
        ],
      };
    },
  },

  create_summary: {
    definition: {
      name: 'create_summary',
      description:
        'Run a workspace tool over sources and persist the result. Tools: summary, key-points, meeting-notes, study-guide, research-report, presentation-outline, timeline, faq, glossary.',
      parameters: {
        type: 'object',
        properties: {
          tool: { type: 'string', default: 'summary' },
          sourceIds: { type: 'array', items: { type: 'string' } },
          title: { type: 'string' },
        },
        required: ['sourceIds'],
      },
    },
    running: (args) => `Generating ${str(args.tool, 'summary').replace('-', ' ')}`,
    async run(args, context) {
      const result = await runTool({
        userId: context.userId,
        toolId: (str(args.tool, 'summary') as never) ?? 'summary',
        sourceIds: arr(args.sourceIds).length ? arr(args.sourceIds) : context.focusSourceIds,
        projectId: context.projectId,
        title: str(args.title) || undefined,
      });
      return {
        summary: `Created "${result.title}".\n\n${(result.content ?? '').slice(0, 1200)}`,
        artifacts: result.artifacts ?? [],
      };
    },
  },

  create_flashcards: {
    definition: {
      name: 'create_flashcards',
      description: 'Generate a flashcard deck from sources.',
      parameters: {
        type: 'object',
        properties: {
          sourceIds: { type: 'array', items: { type: 'string' } },
          count: { type: 'number', default: 12 },
          title: { type: 'string' },
        },
        required: ['sourceIds'],
      },
    },
    running: () => 'Building flashcards',
    async run(args, context) {
      const result = await runTool({
        userId: context.userId,
        toolId: 'flashcards',
        sourceIds: arr(args.sourceIds).length ? arr(args.sourceIds) : context.focusSourceIds,
        projectId: context.projectId,
        title: str(args.title) || undefined,
        options: { count: num(args.count, 12) },
      });
      return {
        summary: `Created deck "${result.title}" with ${result.counts?.cards ?? 0} cards.`,
        artifacts: result.deckId
          ? [
              {
                kind: 'deck',
                id: result.deckId,
                title: result.title,
                href: `/study/decks/${result.deckId}`,
              },
            ]
          : [],
      };
    },
  },

  create_quiz: {
    definition: {
      name: 'create_quiz',
      description: 'Generate a quiz from sources.',
      parameters: {
        type: 'object',
        properties: {
          sourceIds: { type: 'array', items: { type: 'string' } },
          count: { type: 'number', default: 10 },
          difficulty: { type: 'string', enum: ['easy', 'medium', 'hard', 'mixed'] },
          title: { type: 'string' },
        },
        required: ['sourceIds'],
      },
    },
    running: () => 'Writing quiz questions',
    async run(args, context) {
      const result = await runTool({
        userId: context.userId,
        toolId: 'quiz',
        sourceIds: arr(args.sourceIds).length ? arr(args.sourceIds) : context.focusSourceIds,
        projectId: context.projectId,
        title: str(args.title) || undefined,
        options: {
          count: num(args.count, 10),
          difficulty: (str(args.difficulty, 'medium') as never) ?? 'medium',
        },
      });
      return {
        summary: `Created quiz "${result.title}" with ${result.counts?.questions ?? 0} questions.`,
        artifacts: result.quizId
          ? [
              {
                kind: 'quiz',
                id: result.quizId,
                title: result.title,
                href: `/study/quizzes/${result.quizId}`,
              },
            ]
          : [],
      };
    },
  },

  create_task: {
    definition: {
      name: 'create_task',
      description: 'Add a task to the workspace.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          dueAt: { type: 'string', description: 'ISO date' },
          assignee: { type: 'string' },
        },
        required: ['title'],
      },
    },
    running: (args) => `Adding task “${str(args.title)}”`,
    async run(args, context) {
      const db = await getDb();
      const dueRaw = str(args.dueAt);
      const due = dueRaw ? new Date(dueRaw) : null;
      const [task] = await db
        .insert(tasks)
        .values({
          id: ids.task(),
          userId: context.userId,
          projectId: context.projectId ?? null,
          title: str(args.title, 'Untitled task'),
          detail: str(args.detail) || null,
          assignee: str(args.assignee) || null,
          dueAt: due && !Number.isNaN(due.getTime()) ? due : null,
        })
        .returning();
      return {
        summary: `Added task "${task.title}".`,
        artifacts: [{ kind: 'task', id: task.id, title: task.title, href: '/tasks' }],
      };
    },
  },

  search_web: {
    definition: {
      name: 'search_web',
      description:
        'Import a URL (article or YouTube video) into the knowledge base and read it. Requires a specific URL — this workspace does not have an open-web search index.',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url'],
      },
    },
    running: (args) => `Importing ${str(args.url)}`,
    async run(args, context) {
      const result = await ingestUrl({
        userId: context.userId,
        projectId: context.projectId,
        url: str(args.url),
      });
      return {
        summary: `Imported "${result.title}" (${result.sourceId}). ${result.summary ?? ''}`,
        artifacts: [
          {
            kind: 'source',
            id: result.sourceId,
            title: result.title,
            href: `/library/${result.sourceId}`,
          },
        ],
      };
    },
  },

  transcribe_audio: {
    definition: {
      name: 'transcribe_audio',
      description:
        'Transcribe a stored recording. Only works when a speech provider is configured.',
      parameters: {
        type: 'object',
        properties: { recordingId: { type: 'string' } },
        required: ['recordingId'],
      },
    },
    running: () => 'Transcribing audio',
    async run(args, context) {
      const db = await getDb();
      const recording = await db.query.recordings.findFirst({
        where: and(
          eq(recordings.id, str(args.recordingId)),
          eq(recordings.userId, context.userId),
        ),
      });
      if (!recording) return { summary: 'Recording not found.' };

      const { speech } = await import('@/services/speech');
      const provider = speech();
      if (!provider.hosted) {
        return {
          summary:
            'No transcription provider is configured, so this recording cannot be transcribed server-side. Record in the browser to use on-device recognition.',
        };
      }
      const { storage } = await import('@/services/storage');
      if (!recording.storageKey) return { summary: 'That recording has no stored audio.' };
      const audio = await storage().get(recording.storageKey);
      const result = await provider.transcribe(
        audio,
        recording.mimeType ?? 'audio/webm',
        { diarize: true },
      );
      const { ingestTranscript } = await import('@/services/knowledge/ingest');
      const ingested = await ingestTranscript({
        userId: context.userId,
        recordingId: recording.id,
        transcript: {
          provider: result.provider,
          language: result.language,
          durationSec: result.duration,
          segments: result.segments,
        },
      });
      return {
        summary: `Transcribed "${recording.title}" — ${result.segments.length} segments.`,
        artifacts: [
          {
            kind: 'recording',
            id: recording.id,
            title: recording.title,
            href: `/record/${recording.id}`,
          },
        ],
        data: { sourceId: ingested.sourceId },
      };
    },
  },

  answer: {
    definition: {
      name: 'answer',
      description:
        'Produce the final written answer for the user from what has been gathered. Always the last step.',
      parameters: {
        type: 'object',
        properties: { text: { type: 'string' } },
        required: ['text'],
      },
    },
    running: () => 'Writing the answer',
    async run(args) {
      return { summary: str(args.text) };
    },
  },
};

export function toolDefinitions(): ToolDefinition[] {
  return Object.values(AGENT_TOOLS).map((t) => t.definition);
}

