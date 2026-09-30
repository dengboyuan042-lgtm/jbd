# AI Knowledge Workspace

A personal AI workspace for documents, recordings, notes and research. Everything
you add is parsed, chunked, embedded and indexed, so answers can cite the exact
page, timestamp or section they came from.

The product name lives in `src/lib/product.ts` (and `NEXT_PUBLIC_APP_NAME`);
nothing else in the codebase references it.

---

## Running it

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000> and create an account. No external services are
required for the first run:

| Concern       | Default                                  | Production option                      |
| ------------- | ---------------------------------------- | -------------------------------------- |
| Database      | `pglite` — embedded Postgres + pgvector  | `postgres` — any Postgres 15+ w/ vector |
| File storage  | `local` — `./.data/storage`              | `s3` — S3, R2, MinIO, Backblaze         |
| Language model| `local` — built-in extractive engine     | OpenAI / Anthropic / Google / compatible |
| Embeddings    | `local` — hashed n-gram vectors (768d)   | provider embeddings                     |
| Transcription | browser on-device speech recognition     | Whisper / Deepgram                      |

Switching any of them is an environment variable change — see `.env.example`.
Application code never branches on the provider.

### Useful commands

```bash
npm run dev                # development server
npm run build && npm start # production
npm run typecheck          # strict TypeScript, no emit
npm test                   # unit tests for retrieval, NLP and scheduling
npm run db:push            # apply migrations to the configured database
npm run account:create -- you@example.com "Your Name" yourpassword
```

---

## What it does

**Ingest** — PDF, Word, PowerPoint, spreadsheets, Markdown, text, images, audio
and video files; web pages; YouTube videos with captions; live recordings. Each
becomes a *source*: parsed into pages or time ranges, chunked on sentence
boundaries that never cross a page, embedded, and registered for search.

**Ask** — chat grounded in your own material, with streaming answers, inline
citation chips, and jump-to-source that lands on the right PDF page or audio
timestamp. Attachments and drag-and-drop are ingested before the question runs.

**Record** — live capture with waveform, timer, on-device transcription,
turn-taking diarisation and an assistant that answers questions about the
session while it is still running. On save, the transcript is indexed and the
recording becomes a first-class source.

**Produce** — thirteen context-aware tools (summary, key points, action items,
timeline, glossary, FAQ, flashcards, quiz, study guide, mind map, meeting notes,
research report, presentation outline). Each writes a real artefact — a note,
a deck with spaced repetition, a graded quiz, a navigable map, or tasks — with
citations back to the material.

**Agent** — a tool-calling loop with real capabilities: search the knowledge
base, read a document, import a URL, create notes, projects, decks, quizzes and
tasks, transcribe audio. Progress is surfaced as Thinking / Working / Completed
steps; internal reasoning is never displayed.

**Search** — hybrid retrieval: pgvector cosine similarity fused with Postgres
full-text ranking using Reciprocal Rank Fusion, re-scored by lexical coverage
and recency. Natural phrasing such as "meetings last month about pricing" is
parsed into filters before ranking. Available as a full page and as ⌘K.

---

## Architecture

```
src/
  app/                    routes — (auth), (app), api/
  components/
    shell/                app shell: sidebar, topbar, context panel, page frame
    ui/                   design-system primitives
  features/               feature modules (chat, library, notes, voice, study, …)
  hooks/                  data fetching, hotkeys, persisted UI state
  lib/                    env, ids, api client, utils, product identity
  server/
    auth/                 session auth (bcrypt + DB-backed cookie sessions)
    db/                   Drizzle schema, driver, migrator
    context.ts            grounding-material assembly with provenance
    http.ts, sse.ts       route helpers and streaming envelope
  services/
    ai/                   provider interface, prompts, NLP, embeddings
    agent/                tool registry and the agent loop
    knowledge/            parsers, chunking, indexing, ingestion, web import
    search/               hybrid retrieval and query-intent parsing
    speech/               speech provider interface and implementations
    storage/              storage provider interface and implementations
    study/                spaced-repetition scheduling
    tools/                the tool catalogue and their persistence
  styles/globals.css      the entire design system as tokens
```

### Provider interfaces

`AIProvider`, `EmbeddingProvider`, `SpeechProvider` and `StorageProvider` are
plain interfaces. Every feature depends on the interface, never on a vendor.

The default `local` AI provider is **not** a stub: it performs real extractive
summarisation (TextRank-style graph centrality over TF-IDF sentence vectors),
TF-IDF keyword and topic extraction, cue-phrase extraction of action items,
decisions and open questions, definition mining, cloze generation for
flashcards, and distractor selection for quizzes. Answers it produces are
composed from your own sentences with citations. Configure a hosted model and
the same call sites route to it instead.

### Data model

Twenty-eight tables with primary keys, foreign keys, indexes, timestamps and
soft deletes: `users`, `sessions`, `projects`, `sources`, `files`, `documents`,
`document_chunks`, `embeddings`, `recordings`, `transcripts`,
`transcript_segments`, `speakers`, `notes`, `chats`, `messages`, `flashcards`,
`flashcard_decks`, `quizzes`, `quiz_questions`, `quiz_attempts`, `mind_maps`,
`tasks`, `memories`, `jobs`, `activities`, `tags`, `project_items`.

`sources` is the spine: every file, note, recording, page and video registers
one, which is what makes search, citation and tooling uniform across media.

### Security

Every API route resolves the session server-side and scopes every query by
`user_id`. Client-supplied identifiers are always re-checked against ownership
before use — including storage keys, which are namespaced per user *and*
verified against a row the caller owns. Session cookies are HTTP-only,
`SameSite=Lax`, and `Secure` in production. Quiz answers are graded on the
server and never sent to the browser in advance.

---

## Deploying

1. Provision Postgres 15+ with the `vector` extension and set
   `DATABASE_DRIVER=postgres` plus `DATABASE_URL`.
2. Set `AUTH_SECRET` to a long random string.
3. Optionally set `STORAGE_DRIVER=s3` with bucket credentials, `AI_DRIVER` with
   an API key, and `SPEECH_DRIVER` for server-side transcription.
4. `npm run build && npm start`. Migrations apply automatically on first
   request, or run `npm run db:push` ahead of time.

The build has no native dependencies and runs on any Node 20+ host.
