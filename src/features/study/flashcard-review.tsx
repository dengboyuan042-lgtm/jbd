'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronLeft, Eye, Lightbulb, RotateCcw } from 'lucide-react';

import { Page, PageBody, PageHeader } from '@/components/shell/page';
import { Button } from '@/components/ui/button';
import { EmptyState, Progress, Skeleton } from '@/components/ui/primitives';
import { useApi, useHotkey } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Citation } from '@/server/db/schema';
import { GRADE_LABELS, type ReviewGrade } from '@/services/study/srs';
import { usePanel } from '@/features/workspace/workspace-context';
import { CitationList } from '@/features/chat/citation';

type Card = {
  id: string;
  question: string;
  answer: string;
  hint: string | null;
  difficulty: string;
  citation: Citation | null;
  dueAt: string | null;
};

type Deck = { id: string; name: string; total: number; due: number };

/** Spaced-repetition review loop. Grades are scheduled server-side with SM-2. */
export function FlashcardReview({ deckId }: { deckId: string }) {
  const { data, loading, refresh } = useApi<{ cards: Card[]; decks: Deck[] }>(
    `/api/flashcards?deckId=${deckId}`,
  );

  const [index, setIndex] = React.useState(0);
  const [revealed, setRevealed] = React.useState(false);
  const [showHint, setShowHint] = React.useState(false);
  const [reviewed, setReviewed] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  usePanel({ mode: 'chat', title: 'Assistant' }, []);

  const deck = data?.decks.find((d) => d.id === deckId);
  const cards = data?.cards ?? [];
  const card = cards[index];

  const grade = React.useCallback(
    async (value: ReviewGrade) => {
      if (!card || busy) return;
      setBusy(true);
      try {
        await api.post(`/api/flashcards/${card.id}/review`, { grade: value });
        setReviewed((prev) => new Set(prev).add(card.id));
        setRevealed(false);
        setShowHint(false);
        setIndex((i) => Math.min(i + 1, cards.length));
      } finally {
        setBusy(false);
      }
    },
    [card, busy, cards.length],
  );

  useHotkey('space', (e) => {
    e.preventDefault();
    if (!revealed) setRevealed(true);
  });
  useHotkey('1', () => revealed && grade(0));
  useHotkey('2', () => revealed && grade(3));
  useHotkey('3', () => revealed && grade(4));
  useHotkey('4', () => revealed && grade(5));

  if (loading) {
    return (
      <Page>
        <PageHeader title={<Skeleton className="h-4 w-40" />} />
        <PageBody width="narrow">
          <Skeleton className="h-56 w-full rounded-xl" />
        </PageBody>
      </Page>
    );
  }

  const finished = index >= cards.length;

  return (
    <Page>
      <PageHeader
        breadcrumb={
          <Link
            href="/study"
            className="inline-flex items-center gap-1 text-2xs text-tertiary transition-colors hover:text-fg"
          >
            <ChevronLeft className="size-3" />
            Study
          </Link>
        }
        title={deck?.name ?? 'Deck'}
        subtitle={`${cards.length} cards · ${reviewed.size} reviewed this session`}
      />

      <PageBody width="narrow">
        <Progress value={cards.length ? (index / cards.length) * 100 : 0} className="mb-6" />

        {!cards.length ? (
          <EmptyState
            title="This deck is empty"
            description="Generate flashcards from a source to fill it."
          />
        ) : finished ? (
          <EmptyState
            icon={<RotateCcw />}
            title="Session complete"
            description={`You reviewed ${reviewed.size} card${reviewed.size === 1 ? '' : 's'}. Cards return on their own schedule.`}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setIndex(0);
                  setRevealed(false);
                  refresh();
                }}
              >
                Review again
              </Button>
            }
          />
        ) : (
          <div className="space-y-4">
            <div
              className={cn(
                'min-h-56 rounded-xl border border-border bg-surface p-6 shadow-xs transition-shadow',
                revealed && 'shadow-sm',
              )}
            >
              <p className="text-2xs uppercase tracking-[0.07em] text-tertiary">
                Card {index + 1} of {cards.length}
              </p>
              <p className="mt-3 text-lg leading-relaxed text-fg">{card.question}</p>

              {showHint && card.hint ? (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-tertiary">
                  <Lightbulb className="size-3" />
                  {card.hint}
                </p>
              ) : null}

              {revealed ? (
                <div className="mt-5 animate-fade-in border-t border-border pt-4">
                  <p className="text-2xs uppercase tracking-[0.07em] text-tertiary">Answer</p>
                  <p className="mt-2 text-sm leading-relaxed text-secondary">{card.answer}</p>
                  {card.citation ? (
                    <CitationList citations={[card.citation]} className="mt-3" />
                  ) : null}
                </div>
              ) : null}
            </div>

            {revealed ? (
              <div className="grid grid-cols-4 gap-1.5 animate-rise">
                {GRADE_LABELS.map((option, i) => (
                  <button
                    key={option.grade}
                    type="button"
                    disabled={busy}
                    onClick={() => grade(option.grade)}
                    className="flex flex-col items-center gap-0.5 rounded-lg border border-border bg-surface px-2 py-2.5 text-xs font-medium text-secondary transition-colors hover:border-border-strong hover:text-fg disabled:opacity-50"
                  >
                    {option.label}
                    <span className="text-2xs font-normal text-tertiary">{i + 1}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="primary" size="lg" block onClick={() => setRevealed(true)}>
                  <Eye />
                  Reveal answer
                </Button>
                {card.hint ? (
                  <Button variant="secondary" size="lg" onClick={() => setShowHint(true)}>
                    <Lightbulb />
                    Hint
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        )}
      </PageBody>
    </Page>
  );
}
