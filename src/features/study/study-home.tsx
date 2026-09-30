'use client';

import * as React from 'react';
import Link from 'next/link';
import { CircleHelp, GraduationCap, Layers, Network } from 'lucide-react';

import { Page, PageBody, PageHeader } from '@/components/shell/page';
import { Badge, EmptyState, Skeleton } from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { relativeTime } from '@/lib/utils';
import { usePanel } from '@/features/workspace/workspace-context';

type Deck = { id: string; name: string; total: number; due: number; updatedAt: string };
type Quiz = {
  id: string;
  title: string;
  questionCount: number;
  bestScore: number | null;
  attemptCount: number;
  updatedAt: string;
};
type MindMap = { id: string; title: string; updatedAt: string; graph: { nodes: unknown[] } };

export function StudyHome() {
  const decks = useApi<{ decks: Deck[] }>('/api/flashcards');
  const quizzes = useApi<{ quizzes: Quiz[] }>('/api/quizzes');
  const maps = useApi<{ mindMaps: MindMap[] }>('/api/mindmaps');

  usePanel({ mode: 'chat', title: 'Assistant' }, []);

  const totalDue = decks.data?.decks.reduce((sum, d) => sum + d.due, 0) ?? 0;
  const loading = decks.loading || quizzes.loading || maps.loading;
  const empty =
    !loading &&
    !decks.data?.decks.length &&
    !quizzes.data?.quizzes.length &&
    !maps.data?.mindMaps.length;

  return (
    <Page>
      <PageHeader
        title="Study"
        subtitle={
          totalDue
            ? `${totalDue} card${totalDue === 1 ? '' : 's'} due for review`
            : 'Decks, quizzes and maps generated from your material.'
        }
      />

      <PageBody width="wide">
        {loading ? (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        ) : empty ? (
          <EmptyState
            icon={<GraduationCap />}
            title="Nothing to study yet"
            description="Open a document or recording and run the Flashcards, Quiz or Mind map tool. Everything generated lands here."
          />
        ) : (
          <div className="space-y-7">
            {decks.data?.decks.length ? (
              <Section title="Flashcard decks">
                {decks.data.decks.map((deck) => (
                  <Link
                    key={deck.id}
                    href={`/study/decks/${deck.id}`}
                    className="group rounded-lg border border-border bg-surface p-3.5 transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Layers className="size-4 text-tertiary" />
                      {deck.due ? <Badge tone="accent">{deck.due} due</Badge> : null}
                    </div>
                    <p className="mt-2.5 truncate text-sm font-medium text-fg">{deck.name}</p>
                    <p className="mt-1 text-2xs text-tertiary">
                      {deck.total} cards · {relativeTime(deck.updatedAt)}
                    </p>
                  </Link>
                ))}
              </Section>
            ) : null}

            {quizzes.data?.quizzes.length ? (
              <Section title="Quizzes">
                {quizzes.data.quizzes.map((quiz) => (
                  <Link
                    key={quiz.id}
                    href={`/study/quizzes/${quiz.id}`}
                    className="group rounded-lg border border-border bg-surface p-3.5 transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <CircleHelp className="size-4 text-tertiary" />
                      {quiz.bestScore != null ? (
                        <Badge tone={quiz.bestScore >= 70 ? 'success' : 'warning'}>
                          {Math.round(quiz.bestScore)}%
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-2.5 truncate text-sm font-medium text-fg">{quiz.title}</p>
                    <p className="mt-1 text-2xs text-tertiary">
                      {quiz.questionCount} questions
                      {quiz.attemptCount ? ` · ${quiz.attemptCount} attempts` : ''}
                    </p>
                  </Link>
                ))}
              </Section>
            ) : null}

            {maps.data?.mindMaps.length ? (
              <Section title="Mind maps">
                {maps.data.mindMaps.map((map) => (
                  <Link
                    key={map.id}
                    href={`/study/maps/${map.id}`}
                    className="group rounded-lg border border-border bg-surface p-3.5 transition-[border-color,box-shadow] hover:border-border-strong hover:shadow-sm"
                  >
                    <Network className="size-4 text-tertiary" />
                    <p className="mt-2.5 truncate text-sm font-medium text-fg">{map.title}</p>
                    <p className="mt-1 text-2xs text-tertiary">
                      {map.graph?.nodes?.length ?? 0} nodes · {relativeTime(map.updatedAt)}
                    </p>
                  </Link>
                ))}
              </Section>
            ) : null}
          </div>
        )}
      </PageBody>
    </Page>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-2xs font-semibold uppercase tracking-[0.07em] text-tertiary">{title}</h2>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  );
}
