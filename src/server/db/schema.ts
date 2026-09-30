import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core';

/* ───────────────────────────── conventions ─────────────────────────────
   • every row has `id` (text, nanoid), `created_at`, `updated_at`
   • user-owned rows carry `user_id` — the isolation boundary
   • destructive operations set `deleted_at` (soft delete)
   ─────────────────────────────────────────────────────────────────────── */

const id = () => text('id').primaryKey();
const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const deletedAt = () => timestamp('deleted_at', { withTimezone: true });

/* ───────────────────────────── identity ──────────────────────────────── */

export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    avatarUrl: text('avatar_url'),
    locale: text('locale').notNull().default('en'),
    settings: jsonb('settings').$type<UserSettings>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

/* ───────────────────────────── projects ──────────────────────────────── */

export const projects = pgTable(
  'projects',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color').notNull().default('slate'),
    icon: text('icon'),
    goal: text('goal'),
    archived: boolean('archived').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('projects_user_idx').on(t.userId, t.updatedAt)],
);

/* ───────────────────────────── sources ───────────────────────────────────
   A `source` is the canonical, searchable unit of knowledge. Every file,
   note, recording, web page and chat registers one, which is what makes
   cross-modal search and citation uniform.
   ─────────────────────────────────────────────────────────────────────── */

export const sourceKinds = [
  'file',
  'note',
  'recording',
  'webpage',
  'youtube',
  'chat',
] as const;
export type SourceKind = (typeof sourceKinds)[number];

export const sources = pgTable(
  'sources',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    kind: text('kind').$type<SourceKind>().notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    url: text('url'),
    /** id of the row in files/notes/recordings/chats this source mirrors */
    refId: text('ref_id'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    indexedAt: timestamp('indexed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('sources_user_idx').on(t.userId, t.updatedAt),
    index('sources_project_idx').on(t.projectId),
    index('sources_ref_idx').on(t.refId),
    index('sources_kind_idx').on(t.userId, t.kind),
  ],
);

/* ───────────────────────────── files ─────────────────────────────────── */

export const fileStatuses = [
  'uploading',
  'queued',
  'processing',
  'ready',
  'failed',
] as const;
export type FileStatus = (typeof fileStatuses)[number];

export const files = pgTable(
  'files',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    sourceId: text('source_id'),
    name: text('name').notNull(),
    mimeType: text('mime_type').notNull(),
    extension: text('extension').notNull(),
    size: integer('size').notNull(),
    storageKey: text('storage_key').notNull(),
    checksum: text('checksum'),
    status: text('status').$type<FileStatus>().notNull().default('queued'),
    error: text('error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('files_user_idx').on(t.userId, t.updatedAt),
    index('files_project_idx').on(t.projectId),
  ],
);

/** Parsed representation of a file / webpage / transcript. */
export const documents = pgTable(
  'documents',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    fileId: text('file_id').references(() => files.id, { onDelete: 'cascade' }),
    parser: text('parser').notNull(),
    text: text('text').notNull().default(''),
    pageCount: integer('page_count'),
    wordCount: integer('word_count').notNull().default(0),
    language: text('language'),
    outline: jsonb('outline').$type<DocumentOutlineItem[]>().notNull().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('documents_source_idx').on(t.sourceId),
    index('documents_user_idx').on(t.userId),
  ],
);

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    documentId: text('document_id').references(() => documents.id, {
      onDelete: 'cascade',
    }),
    projectId: text('project_id'),
    ordinal: integer('ordinal').notNull(),
    content: text('content').notNull(),
    tokens: integer('tokens').notNull().default(0),
    /** 1-based page for documents */
    page: integer('page'),
    /** seconds into media for transcripts */
    startTime: real('start_time'),
    endTime: real('end_time'),
    heading: text('heading'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index('chunks_source_idx').on(t.sourceId, t.ordinal),
    index('chunks_user_idx').on(t.userId),
    index('chunks_project_idx').on(t.projectId),
  ],
);

/** One vector per chunk, in its own table so the embedding model can change. */
export const embeddings = pgTable(
  'embeddings',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chunkId: text('chunk_id')
      .notNull()
      .references(() => documentChunks.id, { onDelete: 'cascade' }),
    sourceId: text('source_id').notNull(),
    projectId: text('project_id'),
    model: text('model').notNull(),
    dimensions: integer('dimensions').notNull(),
    embedding: vector('embedding', { dimensions: 768 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('embeddings_chunk_idx').on(t.chunkId),
    index('embeddings_user_idx').on(t.userId),
  ],
);

/* ───────────────────────────── recordings ────────────────────────────── */

export const recordings = pgTable(
  'recordings',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    sourceId: text('source_id'),
    title: text('title').notNull(),
    storageKey: text('storage_key'),
    mimeType: text('mime_type'),
    durationSec: real('duration_sec').notNull().default(0),
    status: text('status')
      .$type<'recording' | 'processing' | 'ready' | 'failed'>()
      .notNull()
      .default('recording'),
    language: text('language'),
    waveform: jsonb('waveform').$type<number[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('recordings_user_idx').on(t.userId, t.createdAt)],
);

export const transcripts = pgTable(
  'transcripts',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    recordingId: text('recording_id').references(() => recordings.id, {
      onDelete: 'cascade',
    }),
    sourceId: text('source_id').references(() => sources.id, {
      onDelete: 'cascade',
    }),
    provider: text('provider').notNull(),
    language: text('language'),
    text: text('text').notNull().default(''),
    wordCount: integer('word_count').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('transcripts_recording_idx').on(t.recordingId)],
);

export const speakers = pgTable(
  'speakers',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    transcriptId: text('transcript_id')
      .notNull()
      .references(() => transcripts.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    displayName: text('display_name'),
    color: text('color').notNull().default('slate'),
    createdAt: createdAt(),
  },
  (t) => [index('speakers_transcript_idx').on(t.transcriptId)],
);

export const transcriptSegments = pgTable(
  'transcript_segments',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    transcriptId: text('transcript_id')
      .notNull()
      .references(() => transcripts.id, { onDelete: 'cascade' }),
    speakerId: text('speaker_id').references(() => speakers.id, {
      onDelete: 'set null',
    }),
    ordinal: integer('ordinal').notNull(),
    startTime: real('start_time').notNull(),
    endTime: real('end_time').notNull(),
    text: text('text').notNull(),
    confidence: real('confidence'),
    language: text('language'),
    translation: text('translation'),
    createdAt: createdAt(),
  },
  (t) => [
    index('segments_transcript_idx').on(t.transcriptId, t.ordinal),
    index('segments_time_idx').on(t.transcriptId, t.startTime),
  ],
);

/* ───────────────────────────── notes ─────────────────────────────────── */

export const notes = pgTable(
  'notes',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    sourceId: text('source_id'),
    title: text('title').notNull().default('Untitled'),
    content: text('content').notNull().default(''),
    format: text('format').$type<'markdown'>().notNull().default('markdown'),
    icon: text('icon'),
    pinned: boolean('pinned').notNull().default(false),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    /** where this note came from, e.g. { tool: 'meeting-notes', sourceIds: [] } */
    origin: jsonb('origin').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('notes_user_idx').on(t.userId, t.updatedAt)],
);

/* ───────────────────────────── chat ──────────────────────────────────── */

export const chats = pgTable(
  'chats',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    sourceId: text('source_id'),
    title: text('title').notNull().default('New chat'),
    /** ids of sources scoped into this conversation */
    contextSourceIds: jsonb('context_source_ids').$type<string[]>().notNull().default([]),
    model: text('model'),
    mode: text('mode').$type<'chat' | 'agent'>().notNull().default('chat'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('chats_user_idx').on(t.userId, t.updatedAt)],
);

export const messages = pgTable(
  'messages',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chatId: text('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    role: text('role').$type<'user' | 'assistant' | 'system'>().notNull(),
    content: text('content').notNull().default(''),
    citations: jsonb('citations').$type<Citation[]>().notNull().default([]),
    attachments: jsonb('attachments').$type<MessageAttachment[]>().notNull().default([]),
    steps: jsonb('steps').$type<AgentStepRecord[]>().notNull().default([]),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    model: text('model'),
    createdAt: createdAt(),
  },
  (t) => [index('messages_chat_idx').on(t.chatId, t.createdAt)],
);

/* ───────────────────────────── study tools ───────────────────────────── */

export const flashcards = pgTable(
  'flashcards',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    deckId: text('deck_id'),
    sourceId: text('source_id'),
    question: text('question').notNull(),
    answer: text('answer').notNull(),
    hint: text('hint'),
    difficulty: text('difficulty')
      .$type<'easy' | 'medium' | 'hard'>()
      .notNull()
      .default('medium'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    citation: jsonb('citation').$type<Citation | null>(),
    /* SM-2 spaced-repetition state — algorithm lives in services/study */
    repetitions: integer('repetitions').notNull().default(0),
    easeFactor: real('ease_factor').notNull().default(2.5),
    intervalDays: real('interval_days').notNull().default(0),
    dueAt: timestamp('due_at', { withTimezone: true }),
    lastReviewedAt: timestamp('last_reviewed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('flashcards_user_idx').on(t.userId, t.dueAt),
    index('flashcards_deck_idx').on(t.deckId),
  ],
);

export const flashcardDecks = pgTable(
  'flashcard_decks',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    description: text('description'),
    sourceIds: jsonb('source_ids').$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('decks_user_idx').on(t.userId, t.updatedAt)],
);

export const quizzes = pgTable(
  'quizzes',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    description: text('description'),
    difficulty: text('difficulty')
      .$type<'easy' | 'medium' | 'hard' | 'mixed'>()
      .notNull()
      .default('medium'),
    sourceIds: jsonb('source_ids').$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('quizzes_user_idx').on(t.userId, t.updatedAt)],
);

export const quizQuestions = pgTable(
  'quiz_questions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quizId: text('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    ordinal: integer('ordinal').notNull(),
    type: text('type')
      .$type<'multiple_choice' | 'true_false' | 'short_answer' | 'fill_blank'>()
      .notNull(),
    prompt: text('prompt').notNull(),
    options: jsonb('options').$type<string[]>().notNull().default([]),
    answer: text('answer').notNull(),
    explanation: text('explanation'),
    topic: text('topic'),
    difficulty: text('difficulty')
      .$type<'easy' | 'medium' | 'hard'>()
      .notNull()
      .default('medium'),
    citation: jsonb('citation').$type<Citation | null>(),
    createdAt: createdAt(),
  },
  (t) => [index('quiz_questions_quiz_idx').on(t.quizId, t.ordinal)],
);

export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    quizId: text('quiz_id')
      .notNull()
      .references(() => quizzes.id, { onDelete: 'cascade' }),
    score: real('score').notNull().default(0),
    total: integer('total').notNull().default(0),
    responses: jsonb('responses').$type<QuizResponse[]>().notNull().default([]),
    weakTopics: jsonb('weak_topics').$type<string[]>().notNull().default([]),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('attempts_quiz_idx').on(t.quizId, t.createdAt)],
);

export const mindMaps = pgTable(
  'mind_maps',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    sourceIds: jsonb('source_ids').$type<string[]>().notNull().default([]),
    graph: jsonb('graph').$type<MindMapGraph>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('mindmaps_user_idx').on(t.userId, t.updatedAt)],
);

export const tasks = pgTable(
  'tasks',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    sourceId: text('source_id'),
    title: text('title').notNull(),
    detail: text('detail'),
    status: text('status')
      .$type<'open' | 'doing' | 'done'>()
      .notNull()
      .default('open'),
    priority: text('priority')
      .$type<'low' | 'normal' | 'high'>()
      .notNull()
      .default('normal'),
    assignee: text('assignee'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    citation: jsonb('citation').$type<Citation | null>(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [index('tasks_user_idx').on(t.userId, t.status, t.dueAt)],
);

/* ───────────────────────────── memory ────────────────────────────────── */

export const memories = pgTable(
  'memories',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'cascade',
    }),
    scope: text('scope').$type<'user' | 'project'>().notNull(),
    kind: text('kind')
      .$type<'preference' | 'fact' | 'goal' | 'person' | 'concept' | 'decision'>()
      .notNull()
      .default('fact'),
    key: text('key').notNull(),
    value: text('value').notNull(),
    confidence: real('confidence').notNull().default(1),
    pinned: boolean('pinned').notNull().default(false),
    origin: text('origin').notNull().default('manual'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('memories_user_idx').on(t.userId, t.scope),
    index('memories_project_idx').on(t.projectId),
  ],
);

/* ───────────────────────────── ops ───────────────────────────────────── */

/** Background work queue — parsing, embedding, transcription, tool runs. */
export const jobs = pgTable(
  'jobs',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    status: text('status')
      .$type<'queued' | 'running' | 'succeeded' | 'failed'>()
      .notNull()
      .default('queued'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb('result').$type<Record<string, unknown>>(),
    progress: real('progress').notNull().default(0),
    message: text('message'),
    error: text('error'),
    attempts: integer('attempts').notNull().default(0),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('jobs_status_idx').on(t.status, t.createdAt), index('jobs_user_idx').on(t.userId)],
);

export const activities = pgTable(
  'activities',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: text('project_id'),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    href: text('href'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('activities_user_idx').on(t.userId, t.createdAt)],
);

export const tags = pgTable(
  'tags',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('slate'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('tags_user_name_uq').on(t.userId, t.name)],
);

export const projectItems = pgTable(
  'project_items',
  {
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    sourceId: text('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    addedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.sourceId] })],
);

/* ───────────────────────────── relations ─────────────────────────────── */

export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  sources: many(sources),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  sources: many(sources),
  notes: many(notes),
  chats: many(chats),
  tasks: many(tasks),
}));

export const sourcesRelations = relations(sources, ({ one, many }) => ({
  project: one(projects, {
    fields: [sources.projectId],
    references: [projects.id],
  }),
  documents: many(documents),
  chunks: many(documentChunks),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  source: one(sources, { fields: [documents.sourceId], references: [sources.id] }),
  file: one(files, { fields: [documents.fileId], references: [files.id] }),
  chunks: many(documentChunks),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
  source: one(sources, {
    fields: [documentChunks.sourceId],
    references: [sources.id],
  }),
  document: one(documents, {
    fields: [documentChunks.documentId],
    references: [documents.id],
  }),
}));

export const chatsRelations = relations(chats, ({ many, one }) => ({
  messages: many(messages),
  project: one(projects, { fields: [chats.projectId], references: [projects.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  chat: one(chats, { fields: [messages.chatId], references: [chats.id] }),
}));

export const recordingsRelations = relations(recordings, ({ many }) => ({
  transcripts: many(transcripts),
}));

export const transcriptsRelations = relations(transcripts, ({ one, many }) => ({
  recording: one(recordings, {
    fields: [transcripts.recordingId],
    references: [recordings.id],
  }),
  segments: many(transcriptSegments),
  speakers: many(speakers),
}));

export const transcriptSegmentsRelations = relations(
  transcriptSegments,
  ({ one }) => ({
    transcript: one(transcripts, {
      fields: [transcriptSegments.transcriptId],
      references: [transcripts.id],
    }),
    speaker: one(speakers, {
      fields: [transcriptSegments.speakerId],
      references: [speakers.id],
    }),
  }),
);

export const quizzesRelations = relations(quizzes, ({ many }) => ({
  questions: many(quizQuestions),
  attempts: many(quizAttempts),
}));

export const quizQuestionsRelations = relations(quizQuestions, ({ one }) => ({
  quiz: one(quizzes, { fields: [quizQuestions.quizId], references: [quizzes.id] }),
}));

/* ───────────────────────────── json types ────────────────────────────── */

export type UserSettings = {
  theme?: 'light' | 'dark' | 'system';
  accent?: string;
  language?: string;
  transcriptionLanguage?: string;
  writingStyle?: string;
  defaultModel?: string;
  notifications?: { digest?: boolean; jobs?: boolean; mentions?: boolean };
  reduceMotion?: boolean;
};

export type DocumentOutlineItem = {
  title: string;
  level: number;
  page?: number;
  offset?: number;
};

export type Citation = {
  sourceId: string;
  chunkId?: string;
  title: string;
  kind: SourceKind;
  /** 1-based page number for paginated documents */
  page?: number;
  /** seconds into media */
  time?: number;
  section?: string;
  snippet?: string;
  url?: string;
};

export type MessageAttachment = {
  id: string;
  name: string;
  kind: 'file' | 'image' | 'audio' | 'url';
  mimeType?: string;
  url?: string;
  sourceId?: string;
  size?: number;
};

export type AgentStepRecord = {
  id: string;
  label: string;
  tool?: string;
  status: 'pending' | 'running' | 'done' | 'error';
  detail?: string;
  startedAt?: string;
  finishedAt?: string;
};

export type QuizResponse = {
  questionId: string;
  answer: string;
  correct: boolean;
};

export type MindMapNode = {
  id: string;
  label: string;
  kind: 'root' | 'topic' | 'subtopic' | 'concept';
  detail?: string;
  citation?: Citation;
  children?: string[];
};

export type MindMapGraph = {
  nodes: MindMapNode[];
  edges: { id: string; source: string; target: string; label?: string }[];
};

export const schema = {
  users,
  sessions,
  projects,
  sources,
  files,
  documents,
  documentChunks,
  embeddings,
  recordings,
  transcripts,
  transcriptSegments,
  speakers,
  notes,
  chats,
  messages,
  flashcards,
  flashcardDecks,
  quizzes,
  quizQuestions,
  quizAttempts,
  mindMaps,
  tasks,
  memories,
  jobs,
  activities,
  tags,
  projectItems,
};

/** Raw SQL run after table creation: extensions, FTS columns, vector index. */
export const postMigrationSql = [
  sql`CREATE EXTENSION IF NOT EXISTS vector`,
  sql`ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS search_vector tsvector
      GENERATED ALWAYS AS (to_tsvector('english', content)) STORED`,
  sql`CREATE INDEX IF NOT EXISTS chunks_fts_idx ON document_chunks USING gin (search_vector)`,
  sql`CREATE INDEX IF NOT EXISTS sources_title_trgm_idx ON sources (lower(title))`,
];
