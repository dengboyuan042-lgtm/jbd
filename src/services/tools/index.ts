import { eq } from 'drizzle-orm';

import { ids } from '@/lib/id';
import { getDb } from '@/server/db/client';
import {
  flashcardDecks,
  flashcards,
  mindMaps,
  notes,
  quizQuestions,
  quizzes,
  tasks,
  type Citation,
  type MindMapGraph,
} from '@/server/db/schema';
import { buildContext } from '@/server/context';
import { ai } from '@/services/ai';
import type { ContextDocument, TaskHint } from '@/services/ai/types';
import { indexNote, logActivity } from '@/services/knowledge/ingest';

export type ToolId =
  | 'summary'
  | 'key-points'
  | 'flashcards'
  | 'quiz'
  | 'mind-map'
  | 'study-guide'
  | 'meeting-notes'
  | 'research-report'
  | 'presentation-outline'
  | 'action-items'
  | 'timeline'
  | 'faq'
  | 'glossary';

export type ToolOutputKind = 'note' | 'flashcards' | 'quiz' | 'mind-map' | 'tasks';

export type ToolDescriptor = {
  id: ToolId;
  label: string;
  description: string;
  /** lucide icon name, resolved on the client */
  icon: string;
  group: 'understand' | 'study' | 'produce';
  output: ToolOutputKind;
  task: TaskHint;
  /** creates a persisted artefact the user can revisit */
  persists: boolean;
};

export const TOOLS: ToolDescriptor[] = [
  {
    id: 'summary',
    label: 'Summary',
    description: 'A structured overview of the selected material.',
    icon: 'AlignLeft',
    group: 'understand',
    output: 'note',
    task: { kind: 'summary', style: 'detailed' },
    persists: true,
  },
  {
    id: 'key-points',
    label: 'Key points',
    description: 'The essential takeaways, one per line.',
    icon: 'List',
    group: 'understand',
    output: 'note',
    task: { kind: 'key-points' },
    persists: true,
  },
  {
    id: 'action-items',
    label: 'Action items',
    description: 'Every commitment, owner and deadline mentioned.',
    icon: 'CheckSquare',
    group: 'understand',
    output: 'tasks',
    task: { kind: 'action-items' },
    persists: true,
  },
  {
    id: 'timeline',
    label: 'Timeline',
    description: 'Dated events in chronological order.',
    icon: 'CalendarRange',
    group: 'understand',
    output: 'note',
    task: { kind: 'timeline' },
    persists: true,
  },
  {
    id: 'glossary',
    label: 'Glossary',
    description: 'Domain terms with plain definitions.',
    icon: 'BookA',
    group: 'understand',
    output: 'note',
    task: { kind: 'glossary' },
    persists: true,
  },
  {
    id: 'faq',
    label: 'FAQ',
    description: 'The questions this material answers.',
    icon: 'MessagesSquare',
    group: 'understand',
    output: 'note',
    task: { kind: 'faq' },
    persists: true,
  },
  {
    id: 'flashcards',
    label: 'Flashcards',
    description: 'A reviewable deck with spaced repetition.',
    icon: 'Layers',
    group: 'study',
    output: 'flashcards',
    task: { kind: 'flashcards', count: 14 },
    persists: true,
  },
  {
    id: 'quiz',
    label: 'Quiz',
    description: 'Mixed-format questions with explanations.',
    icon: 'CircleHelp',
    group: 'study',
    output: 'quiz',
    task: { kind: 'quiz', count: 10 },
    persists: true,
  },
  {
    id: 'study-guide',
    label: 'Study guide',
    description: 'Sections, key terms and self-check prompts.',
    icon: 'GraduationCap',
    group: 'study',
    output: 'note',
    task: { kind: 'study-guide' },
    persists: true,
  },
  {
    id: 'mind-map',
    label: 'Mind map',
    description: 'A navigable map of concepts and relations.',
    icon: 'Network',
    group: 'study',
    output: 'mind-map',
    task: { kind: 'mind-map' },
    persists: true,
  },
  {
    id: 'meeting-notes',
    label: 'Meeting notes',
    description: 'Formal notes with decisions and follow-ups.',
    icon: 'NotepadText',
    group: 'produce',
    output: 'note',
    task: { kind: 'meeting-notes' },
    persists: true,
  },
  {
    id: 'research-report',
    label: 'Research report',
    description: 'Executive summary, findings and sources.',
    icon: 'FileText',
    group: 'produce',
    output: 'note',
    task: { kind: 'research-report' },
    persists: true,
  },
  {
    id: 'presentation-outline',
    label: 'Presentation outline',
    description: 'A slide-by-slide narrative.',
    icon: 'Presentation',
    group: 'produce',
    output: 'note',
    task: { kind: 'presentation-outline' },
    persists: true,
  },
];

export function getTool(id: string): ToolDescriptor | undefined {
  return TOOLS.find((t) => t.id === id);
}

export type RunToolInput = {
  userId: string;
  toolId: ToolId;
  sourceIds?: string[];
  projectId?: string | null;
  title?: string;
  options?: { count?: number; difficulty?: string; types?: string[] };
  /** persist the artefact (default true) */
  save?: boolean;
};

export type ToolArtifact = { kind: string; id: string; title: string; href: string };

export type RunToolResult = {
  tool: ToolId;
  output: ToolOutputKind;
  title: string;
  artifacts?: ToolArtifact[];
  /** markdown for note-shaped output */
  content?: string;
  citations: Citation[];
  noteId?: string;
  deckId?: string;
  quizId?: string;
  mindMapId?: string;
  taskIds?: string[];
  counts?: Record<string, number>;
};

/**
 * Tools are not isolated features — each one runs against the same retrieval
 * context as chat, so "make flashcards" in a document, a project or a
 * recording all resolve through one code path.
 */
export async function runTool(input: RunToolInput): Promise<RunToolResult> {
  const tool = getTool(input.toolId);
  if (!tool) throw new Error(`Unknown tool: ${input.toolId}`);

  const context = await buildContext({
    userId: input.userId,
    sourceIds: input.sourceIds,
    projectId: input.projectId,
    whole: true,
    maxTokens: 16_000,
    maxDocuments: 24,
  });

  if (!context.length) {
    throw new Error(
      'Nothing to work with. Select at least one source that has been indexed.',
    );
  }

  const task = applyOptions(tool.task, input.options);
  const baseTitle =
    input.title ?? `${tool.label} — ${context[0]?.title ?? 'Workspace'}`;
  const save = input.save !== false;

  switch (tool.output) {
    case 'flashcards':
      return buildFlashcards(input, tool, task, context, baseTitle, save);
    case 'quiz':
      return buildQuiz(input, tool, task, context, baseTitle, save);
    case 'mind-map':
      return buildMindMap(input, tool, task, context, baseTitle, save);
    case 'tasks':
      return buildTasks(input, tool, task, context, baseTitle, save);
    case 'note':
    default:
      return buildNote(input, tool, task, context, baseTitle, save);
  }
}

function applyOptions(
  task: TaskHint,
  options?: RunToolInput['options'],
): TaskHint {
  if (!options) return task;
  if (task.kind === 'flashcards') return { ...task, count: options.count ?? task.count };
  if (task.kind === 'quiz') {
    return {
      ...task,
      count: options.count ?? task.count,
      difficulty: options.difficulty ?? task.difficulty,
      types: options.types ?? task.types,
    };
  }
  return task;
}

/* ─────────────────────────────── note output ─────────────────────────── */

async function buildNote(
  input: RunToolInput,
  tool: ToolDescriptor,
  task: TaskHint,
  context: ContextDocument[],
  title: string,
  save: boolean,
): Promise<RunToolResult> {
  const result = await ai.task(task, { context });
  const citations = result.citations ?? context.map((c) => c.citation);

  if (!save) {
    return { tool: tool.id, output: 'note', title, content: result.text, citations };
  }

  const db = await getDb();
  const noteId = ids.note();
  const content = `${result.text}\n\n${renderSourceFooter(citations)}`;

  await db.insert(notes).values({
    id: noteId,
    userId: input.userId,
    projectId: input.projectId ?? null,
    title,
    content,
    origin: { tool: tool.id, sourceIds: input.sourceIds ?? [] },
  });

  const sourceId = await indexNote({
    userId: input.userId,
    noteId,
    title,
    content,
    projectId: input.projectId ?? null,
  });
  await db.update(notes).set({ sourceId }).where(eq(notes.id, noteId));
  await logActivity(input.userId, {
    kind: `tool.${tool.id}`,
    title,
    href: `/notes/${noteId}`,
    projectId: input.projectId ?? null,
  });

  return {
    tool: tool.id,
    output: 'note',
    title,
    content,
    citations,
    noteId,
    artifacts: [{ kind: 'note', id: noteId, title, href: `/notes/${noteId}` }],
  };
}

/* ───────────────────────────── flashcards ────────────────────────────── */

type CardPayload = {
  question: string;
  answer: string;
  hint?: string | null;
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
  citationIndex?: number | null;
};

async function buildFlashcards(
  input: RunToolInput,
  tool: ToolDescriptor,
  task: TaskHint,
  context: ContextDocument[],
  title: string,
  save: boolean,
): Promise<RunToolResult> {
  const parsed = await ai.json<{ cards: CardPayload[] }>(task, { context });
  const cards = (parsed.cards ?? []).filter((c) => c.question && c.answer);
  if (!cards.length) throw new Error('No flashcards could be derived from this material.');

  const citations = context.map((c) => c.citation);
  if (!save) {
    return {
      tool: tool.id,
      output: 'flashcards',
      title,
      citations,
      counts: { cards: cards.length },
    };
  }

  const db = await getDb();
  const deckId = ids.deck();
  await db.insert(flashcardDecks).values({
    id: deckId,
    userId: input.userId,
    projectId: input.projectId ?? null,
    name: title,
    sourceIds: input.sourceIds ?? [],
  });

  await db.insert(flashcards).values(
    cards.map((card) => ({
      id: ids.flashcard(),
      userId: input.userId,
      projectId: input.projectId ?? null,
      deckId,
      sourceId: input.sourceIds?.[0] ?? null,
      question: card.question,
      answer: card.answer,
      hint: card.hint ?? null,
      difficulty: card.difficulty ?? 'medium',
      tags: card.tags ?? [],
      citation: citationAt(context, card.citationIndex),
      dueAt: new Date(),
    })),
  );

  await logActivity(input.userId, {
    kind: 'tool.flashcards',
    title,
    href: `/study/decks/${deckId}`,
    projectId: input.projectId ?? null,
  });

  return {
    tool: tool.id,
    output: 'flashcards',
    title,
    citations,
    deckId,
    counts: { cards: cards.length },
    artifacts: [{ kind: 'deck', id: deckId, title, href: `/study/decks/${deckId}` }],
  };
}

/* ─────────────────────────────── quiz ────────────────────────────────── */

type QuestionPayload = {
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'fill_blank';
  prompt: string;
  options?: string[];
  answer: string;
  explanation?: string;
  topic?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  citationIndex?: number | null;
};

async function buildQuiz(
  input: RunToolInput,
  tool: ToolDescriptor,
  task: TaskHint,
  context: ContextDocument[],
  title: string,
  save: boolean,
): Promise<RunToolResult> {
  const parsed = await ai.json<{ questions: QuestionPayload[] }>(task, { context });
  const questions = (parsed.questions ?? []).filter((q) => q.prompt && q.answer);
  if (!questions.length) throw new Error('No questions could be derived from this material.');

  const citations = context.map((c) => c.citation);
  if (!save) {
    return {
      tool: tool.id,
      output: 'quiz',
      title,
      citations,
      counts: { questions: questions.length },
    };
  }

  const db = await getDb();
  const quizId = ids.quiz();
  await db.insert(quizzes).values({
    id: quizId,
    userId: input.userId,
    projectId: input.projectId ?? null,
    title,
    difficulty: (input.options?.difficulty as 'easy' | 'medium' | 'hard' | 'mixed') ?? 'medium',
    sourceIds: input.sourceIds ?? [],
  });

  await db.insert(quizQuestions).values(
    questions.map((q, i) => ({
      id: ids.question(),
      userId: input.userId,
      quizId,
      ordinal: i,
      type: q.type,
      prompt: q.prompt,
      options: q.options ?? [],
      answer: q.answer,
      explanation: q.explanation ?? null,
      topic: q.topic ?? null,
      difficulty: q.difficulty ?? 'medium',
      citation: citationAt(context, q.citationIndex),
    })),
  );

  await logActivity(input.userId, {
    kind: 'tool.quiz',
    title,
    href: `/study/quizzes/${quizId}`,
    projectId: input.projectId ?? null,
  });

  return {
    tool: tool.id,
    output: 'quiz',
    title,
    citations,
    quizId,
    counts: { questions: questions.length },
    artifacts: [{ kind: 'quiz', id: quizId, title, href: `/study/quizzes/${quizId}` }],
  };
}

/* ────────────────────────────── mind map ─────────────────────────────── */

type MindMapPayload = {
  nodes: {
    id: string;
    label: string;
    kind: 'root' | 'topic' | 'subtopic' | 'concept';
    detail?: string | null;
    citationIndex?: number | null;
  }[];
  edges: { id: string; source: string; target: string; label?: string | null }[];
};

async function buildMindMap(
  input: RunToolInput,
  tool: ToolDescriptor,
  task: TaskHint,
  context: ContextDocument[],
  title: string,
  save: boolean,
): Promise<RunToolResult> {
  const parsed = await ai.json<MindMapPayload>(task, { context });
  if (!parsed.nodes?.length) throw new Error('No structure could be derived from this material.');

  const graph: MindMapGraph = {
    nodes: parsed.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      kind: n.kind,
      detail: n.detail ?? undefined,
      citation: citationAt(context, n.citationIndex) ?? undefined,
    })),
    edges: (parsed.edges ?? []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label ?? undefined,
    })),
  };

  const citations = context.map((c) => c.citation);
  if (!save) {
    return { tool: tool.id, output: 'mind-map', title, citations, counts: { nodes: graph.nodes.length } };
  }

  const db = await getDb();
  const mindMapId = ids.mindMap();
  await db.insert(mindMaps).values({
    id: mindMapId,
    userId: input.userId,
    projectId: input.projectId ?? null,
    title,
    sourceIds: input.sourceIds ?? [],
    graph,
  });

  await logActivity(input.userId, {
    kind: 'tool.mind-map',
    title,
    href: `/study/maps/${mindMapId}`,
    projectId: input.projectId ?? null,
  });

  return {
    tool: tool.id,
    output: 'mind-map',
    title,
    citations,
    mindMapId,
    counts: { nodes: graph.nodes.length },
    artifacts: [{ kind: 'mind map', id: mindMapId, title, href: `/study/maps/${mindMapId}` }],
  };
}

/* ─────────────────────────────── tasks ───────────────────────────────── */

async function buildTasks(
  input: RunToolInput,
  tool: ToolDescriptor,
  task: TaskHint,
  context: ContextDocument[],
  title: string,
  save: boolean,
): Promise<RunToolResult> {
  const result = await ai.task(task, { context });
  const citations = result.citations ?? context.map((c) => c.citation);

  const lines = result.text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s*(\[[ x]\])?\s*/.test(l))
    .map((l) => l.replace(/^[-*]\s*(\[[ x]\])?\s*/, '').trim())
    .filter((l) => l.length > 3);

  if (!save || !lines.length) {
    return {
      tool: tool.id,
      output: 'tasks',
      title,
      content: result.text,
      citations,
      counts: { tasks: lines.length },
    };
  }

  const db = await getDb();
  const rows = lines.map((line) => {
    const owner = line.match(/\*\*([^*]+)\*\*/)?.[1];
    const due = line.match(/_([^_]+)_/)?.[1];
    const clean = line.replace(/—.*$/, '').replace(/\*\*/g, '').trim();
    return {
      id: ids.task(),
      userId: input.userId,
      projectId: input.projectId ?? null,
      sourceId: input.sourceIds?.[0] ?? null,
      title: clean.slice(0, 280),
      detail: owner || due ? [owner && `Owner: ${owner}`, due && `Due: ${due}`].filter(Boolean).join(' · ') : null,
      assignee: owner ?? null,
      citation: citations[0] ?? null,
    };
  });

  await db.insert(tasks).values(rows);
  await logActivity(input.userId, {
    kind: 'tool.action-items',
    title: `${rows.length} action item${rows.length === 1 ? '' : 's'}`,
    href: '/tasks',
    projectId: input.projectId ?? null,
  });

  return {
    tool: tool.id,
    output: 'tasks',
    title,
    content: result.text,
    citations,
    taskIds: rows.map((r) => r.id),
    counts: { tasks: rows.length },
    artifacts: [
      {
        kind: 'tasks',
        id: rows[0].id,
        title: `${rows.length} action item${rows.length === 1 ? '' : 's'}`,
        href: '/tasks',
      },
    ],
  };
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

function citationAt(
  context: ContextDocument[],
  index?: number | null,
): Citation | null {
  if (index == null || index < 0 || index >= context.length) return null;
  return context[index].citation;
}

function renderSourceFooter(citations: Citation[]): string {
  if (!citations.length) return '';
  const unique = new Map<string, Citation>();
  for (const c of citations) if (!unique.has(c.sourceId)) unique.set(c.sourceId, c);
  const lines = [...unique.values()].map((c, i) => {
    const locator = [
      c.page != null ? `p. ${c.page}` : null,
      c.time != null ? formatClock(c.time) : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return `${i + 1}. [${c.title}](/library/${c.sourceId})${locator ? ` — ${locator}` : ''}`;
  });
  return `---\n\n**Sources**\n\n${lines.join('\n')}`;
}

function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
