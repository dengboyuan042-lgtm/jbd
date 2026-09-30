'use client';

import * as React from 'react';
import { ArrowUp, Lightbulb, Radio } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { AutoTextarea } from '@/components/ui/input';
import { EmptyState, Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { cn, formatDuration } from '@/lib/utils';
import { Markdown } from '@/features/chat/markdown';
import { useLiveSession } from './live-session-store';

type Turn = { id: string; question: string; answer: string; at: number };

/**
 * Answers questions about a recording while it is still running, using the
 * transcript captured so far. It calls the same tool endpoint as everything
 * else, with the live text supplied as unsaved context.
 */
export function LiveAssistant() {
  const session = useLiveSession();
  const [question, setQuestion] = React.useState('');
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [insight, setInsight] = React.useState<string | null>(null);
  const lastInsightAt = React.useRef(0);

  const transcript = session.segments.map((s) => s.text).join(' ');

  // Periodic live insight: refresh at most every 45s while actively recording.
  React.useEffect(() => {
    if (!session.active || session.paused) return;
    const now = Date.now();
    if (transcript.length < 400) return;
    if (now - lastInsightAt.current < 45_000) return;
    lastInsightAt.current = now;

    let cancelled = false;
    api
      .post<{ content: string }>('/api/live/insight', { transcript: transcript.slice(-6000) })
      .then((data) => !cancelled && setInsight(data.content))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [transcript, session.active, session.paused]);

  const ask = async () => {
    const text = question.trim();
    if (!text || busy) return;
    setBusy(true);
    setQuestion('');
    const id = `turn-${Date.now()}`;
    setTurns((prev) => [...prev, { id, question: text, answer: '', at: session.elapsed }]);
    try {
      const data = await api.post<{ content: string }>('/api/live/ask', {
        question: text,
        transcript,
      });
      setTurns((prev) =>
        prev.map((t) => (t.id === id ? { ...t, answer: data.content } : t)),
      );
    } catch (error) {
      setTurns((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                answer: `_${error instanceof Error ? error.message : 'Could not answer.'}_`,
              }
            : t,
        ),
      );
    } finally {
      setBusy(false);
    }
  };

  if (!session.recordingId) {
    return (
      <EmptyState
        compact
        icon={<Radio />}
        title="No active session"
        description="Start a recording and this panel will follow along, answering questions from what has been said so far."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 scrollbar-thin">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-subtle px-2.5 py-2">
          <span
            className={cn(
              'size-1.5 rounded-full',
              session.active && !session.paused ? 'animate-pulse bg-danger' : 'bg-tertiary',
            )}
          />
          <span className="text-xs text-secondary">
            {session.active ? (session.paused ? 'Paused' : 'Listening') : 'Stopped'}
          </span>
          <span className="ml-auto font-mono text-xs tabular-nums text-tertiary">
            {formatDuration(session.elapsed)}
          </span>
        </div>

        {insight ? (
          <div className="rounded-lg border border-[var(--accent-border)] bg-accent-subtle px-2.5 py-2">
            <div className="mb-1 flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wide text-accent-text">
              <Lightbulb className="size-3" />
              Live insight
            </div>
            <Markdown content={insight} compact className="text-xs" />
          </div>
        ) : null}

        {turns.length === 0 && !insight ? (
          <p className="px-1 py-6 text-center text-xs leading-relaxed text-tertiary">
            Ask something about what has been said so far — “what was the second issue?”,
            “who owns the migration?”
          </p>
        ) : null}

        {turns.map((turn) => (
          <div key={turn.id} className="space-y-1.5">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-2xs tabular-nums text-tertiary">
                {formatDuration(turn.at)}
              </span>
              <p className="min-w-0 flex-1 text-xs font-medium text-fg">{turn.question}</p>
            </div>
            {turn.answer ? (
              <Markdown content={turn.answer} compact className="text-xs" />
            ) : (
              <Spinner className="size-3" />
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-border p-2.5">
        <div className="rounded-lg border border-border bg-surface px-2.5 pt-2">
          <AutoTextarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void ask();
              }
            }}
            placeholder="Ask about this session…"
            maxRows={5}
            rows={1}
          />
          <div className="flex justify-end pb-1.5 pt-1">
            <Button
              size="icon-xs"
              variant="primary"
              onClick={ask}
              loading={busy}
              disabled={!question.trim()}
              aria-label="Ask"
            >
              <ArrowUp />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
