'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, ChevronLeft, RotateCcw, X } from 'lucide-react';

import { Page, PageBody, PageHeader } from '@/components/shell/page';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge, EmptyState, Progress, Skeleton } from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Citation } from '@/server/db/schema';
import { usePanel } from '@/features/workspace/workspace-context';
import { CitationList } from '@/features/chat/citation';

type Question = {
  id: string;
  ordinal: number;
  type: 'multiple_choice' | 'true_false' | 'short_answer' | 'fill_blank';
  prompt: string;
  options: string[];
  topic: string | null;
  difficulty: string;
};

type ReviewRow = {
  questionId: string;
  prompt: string;
  yourAnswer: string;
  correctAnswer: string;
  correct: boolean;
  explanation: string | null;
  topic: string | null;
  citation: Citation | null;
};

/** Answers are graded server-side; the client never receives the key up front. */
export function QuizRunner({ quizId }: { quizId: string }) {
  const { data, loading } = useApi<{
    quiz: { id: string; title: string; difficulty: string };
    questions: Question[];
  }>(`/api/quizzes/${quizId}`);

  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{
    score: number;
    total: number;
    weakTopics: string[];
    review: ReviewRow[];
  } | null>(null);

  usePanel({ mode: 'chat', title: 'Assistant' }, []);

  const questions = data?.questions ?? [];
  const answered = Object.values(answers).filter(Boolean).length;

  const submit = async () => {
    setSubmitting(true);
    try {
      const response = await api.post<{
        attempt: { score: number; total: number; weakTopics: string[] };
        review: ReviewRow[];
      }>(`/api/quizzes/${quizId}/attempt`, {
        responses: questions.map((q) => ({
          questionId: q.id,
          answer: answers[q.id] ?? '',
        })),
      });
      setResult({
        score: response.attempt.score,
        total: response.attempt.total,
        weakTopics: response.attempt.weakTopics,
        review: response.review,
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Page>
        <PageHeader title={<Skeleton className="h-4 w-40" />} />
        <PageBody width="narrow">
          <Skeleton className="h-64 w-full rounded-lg" />
        </PageBody>
      </Page>
    );
  }

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
        title={data?.quiz.title ?? 'Quiz'}
        subtitle={
          result
            ? `Scored ${Math.round(result.score)}%`
            : `${questions.length} questions · ${answered} answered`
        }
        actions={
          result ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setResult(null);
                setAnswers({});
              }}
            >
              <RotateCcw />
              Retake
            </Button>
          ) : null
        }
      />

      <PageBody width="narrow">
        {!questions.length ? (
          <EmptyState title="This quiz has no questions" />
        ) : result ? (
          <ResultView result={result} />
        ) : (
          <div className="space-y-5">
            <Progress value={(answered / questions.length) * 100} />

            {questions.map((question, index) => (
              <div
                key={question.id}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <div className="mb-2.5 flex items-center gap-2">
                  <span className="text-2xs font-medium text-tertiary">
                    {index + 1}/{questions.length}
                  </span>
                  {question.topic ? <Badge>{question.topic}</Badge> : null}
                  <Badge
                    tone={
                      question.difficulty === 'hard'
                        ? 'warning'
                        : question.difficulty === 'easy'
                          ? 'success'
                          : 'neutral'
                    }
                  >
                    {question.difficulty}
                  </Badge>
                </div>

                <p className="text-sm leading-relaxed text-fg">{question.prompt}</p>

                <div className="mt-3 space-y-1.5">
                  {question.type === 'multiple_choice' || question.type === 'true_false' ? (
                    question.options.map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() =>
                          setAnswers((prev) => ({ ...prev, [question.id]: option }))
                        }
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                          answers[question.id] === option
                            ? 'border-accent bg-accent-subtle text-fg'
                            : 'border-border bg-surface text-secondary hover:border-border-strong',
                        )}
                      >
                        <span
                          className={cn(
                            'size-3 shrink-0 rounded-full border',
                            answers[question.id] === option
                              ? 'border-accent bg-accent'
                              : 'border-border-strong',
                          )}
                        />
                        {option}
                      </button>
                    ))
                  ) : (
                    <Input
                      value={answers[question.id] ?? ''}
                      onChange={(e) =>
                        setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }))
                      }
                      placeholder={
                        question.type === 'fill_blank'
                          ? 'Fill in the blank'
                          : 'Answer in a sentence'
                      }
                    />
                  )}
                </div>
              </div>
            ))}

            <Button
              variant="primary"
              size="lg"
              block
              onClick={submit}
              loading={submitting}
              disabled={!answered}
            >
              Submit {answered < questions.length ? `(${answered}/${questions.length})` : ''}
            </Button>
          </div>
        )}
      </PageBody>
    </Page>
  );
}

function ResultView({
  result,
}: {
  result: { score: number; total: number; weakTopics: string[]; review: ReviewRow[] };
}) {
  const correct = result.review.filter((r) => r.correct).length;
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-surface p-5 text-center">
        <p className="text-3xl font-medium tracking-tight text-fg">
          {Math.round(result.score)}%
        </p>
        <p className="mt-1 text-sm text-tertiary">
          {correct} of {result.total} correct
        </p>
        {result.weakTopics.length ? (
          <div className="mt-3 flex flex-wrap justify-center gap-1.5">
            <span className="text-2xs text-tertiary">Review:</span>
            {result.weakTopics.map((topic) => (
              <Badge key={topic} tone="warning">
                {topic}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-2.5">
        {result.review.map((row, index) => (
          <div
            key={row.questionId}
            className={cn(
              'rounded-lg border bg-surface p-3.5',
              row.correct ? 'border-border' : 'border-danger-border',
            )}
          >
            <div className="flex items-start gap-2.5">
              <span
                className={cn(
                  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full',
                  row.correct ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger',
                )}
              >
                {row.correct ? <Check className="size-3" /> : <X className="size-3" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fg">
                  <span className="mr-1.5 text-2xs text-tertiary">{index + 1}.</span>
                  {row.prompt}
                </p>
                <p className="mt-1.5 text-xs text-tertiary">
                  Your answer:{' '}
                  <span className={row.correct ? 'text-success' : 'text-danger'}>
                    {row.yourAnswer || '—'}
                  </span>
                </p>
                {!row.correct ? (
                  <p className="mt-0.5 text-xs text-tertiary">
                    Correct: <span className="text-fg">{row.correctAnswer}</span>
                  </p>
                ) : null}
                {row.explanation ? (
                  <p className="mt-2 rounded-md bg-bg-sunken px-2.5 py-1.5 text-xs leading-relaxed text-secondary">
                    {row.explanation}
                  </p>
                ) : null}
                {row.citation ? (
                  <CitationList citations={[row.citation]} className="mt-2" />
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
