'use client';

import * as React from 'react';
import {
  ArrowUp,
  Check,
  Languages,
  ListChecks,
  PenLine,
  Replace,
  SquarePlus,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { AutoTextarea } from '@/components/ui/input';
import { Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { Markdown } from '@/features/chat/markdown';
import { noteBridge, useNoteSelection } from './note-bridge';

type Action = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  action: string;
  instruction?: string;
  targetLanguage?: string;
};

const ACTIONS: Action[] = [
  { id: 'rewrite', label: 'Rewrite', icon: PenLine, action: 'rewrite' },
  { id: 'shorten', label: 'Shorten', icon: Wand2, action: 'rewrite', instruction: 'Make it about half as long.' },
  { id: 'expand', label: 'Expand', icon: SquarePlus, action: 'expand' },
  { id: 'summary', label: 'Summarise', icon: ListChecks, action: 'summary' },
  { id: 'keypoints', label: 'Key points', icon: ListChecks, action: 'key-points' },
  { id: 'actions', label: 'Action items', icon: ListChecks, action: 'action-items' },
  { id: 'explain', label: 'Explain', icon: Wand2, action: 'explain' },
  { id: 'translate', label: 'Translate', icon: Languages, action: 'translate', targetLanguage: 'English' },
];

/** Operates on the note open in the centre pane through a small bridge. */
export function WritingAssistant({
  noteId,
  sourceIds,
}: {
  noteId: string;
  sourceIds: string[];
}) {
  const selection = useNoteSelection();
  const [result, setResult] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [prompt, setPrompt] = React.useState('');

  const target = selection.text || noteBridge.getContent();
  const scope = selection.text ? 'selection' : 'note';

  const run = async (action: Action | null, custom?: string) => {
    const text = target.trim();
    if (!text) {
      toast.error('Nothing to work on yet — write something first.');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const data = await api.post<{ content: string }>('/api/notes/assist', {
        action: action?.action ?? 'rewrite',
        instruction: custom ?? action?.instruction,
        targetLanguage: action?.targetLanguage,
        text: text.slice(0, 24_000),
        sourceIds,
      });
      setResult(data.content);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
        <p className="mb-2 text-2xs uppercase tracking-[0.07em] text-tertiary">
          Working on {scope}
          {selection.text ? ` · ${selection.text.length} chars` : ''}
        </p>

        <div className="grid grid-cols-2 gap-1">
          {ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              disabled={busy}
              onClick={() => run(action)}
              className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-secondary transition-colors hover:border-border-strong hover:text-fg disabled:opacity-50"
            >
              <action.icon className="size-3.5 text-tertiary" />
              {action.label}
            </button>
          ))}
        </div>

        {busy ? (
          <div className="mt-4 flex items-center gap-2 text-xs text-tertiary">
            <Spinner className="size-3" />
            Working
          </div>
        ) : null}

        {result ? (
          <div className="mt-4 space-y-2 rounded-lg border border-border bg-bg-subtle p-2.5">
            <Markdown content={result} compact className="text-xs" />
            <div className="flex gap-1.5 pt-1">
              <Button
                size="xs"
                variant="primary"
                onClick={() => {
                  if (selection.text) noteBridge.replaceSelection(result);
                  else noteBridge.append(`\n\n${result}`);
                  toast.success(selection.text ? 'Replaced' : 'Appended to note');
                  setResult(null);
                }}
              >
                <Replace className="size-3" />
                {selection.text ? 'Replace' : 'Append'}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={async () => {
                  await navigator.clipboard.writeText(result);
                  toast.success('Copied');
                }}
              >
                <Check className="size-3" />
                Copy
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="border-t border-border p-2.5">
        <div className="rounded-lg border border-border bg-surface px-2.5 pt-2">
          <AutoTextarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const text = prompt.trim();
                if (!text) return;
                setPrompt('');
                void run(null, text);
              }
            }}
            placeholder={`Tell the assistant what to do with this ${scope}…`}
            maxRows={5}
            rows={1}
          />
          <div className="flex justify-end pb-1.5 pt-1">
            <Button
              size="icon-xs"
              variant="primary"
              disabled={!prompt.trim() || busy}
              onClick={() => {
                const text = prompt.trim();
                setPrompt('');
                void run(null, text);
              }}
              aria-label="Run"
            >
              <ArrowUp />
            </Button>
          </div>
        </div>
        {noteId ? null : (
          <p className="mt-1.5 text-2xs text-tertiary">Open a note to use these actions.</p>
        )}
      </div>
    </div>
  );
}
