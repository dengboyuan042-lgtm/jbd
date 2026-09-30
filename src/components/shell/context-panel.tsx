'use client';

import * as React from 'react';
import { PanelRightClose } from 'lucide-react';

import { Tooltip } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/features/workspace/workspace-context';
import { ChatThread } from '@/features/chat/chat-thread';
import { LiveAssistant } from '@/features/voice/live-assistant';
import { WritingAssistant } from '@/features/notes/writing-assistant';

/**
 * The right-hand panel adapts to what the user is doing. Each mode is a real
 * surface with its own affordances rather than the same chat box relabelled.
 */
export function ContextPanel() {
  const { panel, setPanelOpen } = useWorkspace();

  const heading =
    panel.title ??
    (panel.mode === 'live'
      ? 'Live assistant'
      : panel.mode === 'writing'
        ? 'Writing assistant'
        : panel.mode === 'project'
          ? 'Project agent'
          : 'Assistant');

  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-l border-border bg-bg">
      <div className="flex h-(--topbar-h) shrink-0 items-center gap-2 border-b border-border px-3">
        <span className="truncate text-xs font-medium text-fg">{heading}</span>
        {panel.sourceIds?.length ? (
          <span className="shrink-0 rounded-xs bg-bg-sunken px-1.5 py-0.5 text-2xs text-tertiary">
            {panel.sourceIds.length} source{panel.sourceIds.length === 1 ? '' : 's'}
          </span>
        ) : null}
        <div className="flex-1" />
        <Tooltip content="Hide panel" shortcut="mod .">
          <button
            type="button"
            onClick={() => setPanelOpen(false)}
            className="rounded-md p-1 text-tertiary transition-colors hover:bg-surface-hover hover:text-fg"
            aria-label="Hide panel"
          >
            <PanelRightClose className="size-4" />
          </button>
        </Tooltip>
      </div>

      <div className={cn('min-h-0 flex-1')}>
        <PanelBody />
      </div>
    </aside>
  );
}

function PanelBody() {
  const { panel } = useWorkspace();

  switch (panel.mode) {
    case 'live':
      return <LiveAssistant />;
    case 'writing':
      return (
        <WritingAssistant
          noteId={String(panel.payload?.noteId ?? '')}
          sourceIds={panel.sourceIds ?? []}
        />
      );
    case 'project':
      return (
        <ChatThread
          key={`project-${panel.projectId}`}
          variant="panel"
          projectId={panel.projectId}
          sourceIds={panel.sourceIds}
          emptyTitle="Project agent"
          emptyDescription="Ask across everything in this project, or tell it what to produce."
          suggestions={[
            'What is the current state of this project?',
            'Extract all open action items',
            'Draft a status summary',
          ]}
        />
      );
    case 'reader':
    case 'chat':
    default:
      return (
        <ChatThread
          key={`panel-${(panel.sourceIds ?? []).join(',')}`}
          variant="panel"
          sourceIds={panel.sourceIds}
          projectId={panel.projectId}
          emptyTitle={panel.sourceIds?.length ? 'Ask about this' : 'Ask anything'}
          suggestions={
            panel.sourceIds?.length
              ? ['Summarise this', 'What are the key points?', 'What should I do next?']
              : []
          }
        />
      );
  }
}
