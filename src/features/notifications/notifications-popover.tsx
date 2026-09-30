'use client';

import * as React from 'react';
import Link from 'next/link';
import { Activity } from 'lucide-react';

import { Popover, PopoverContent, PopoverTrigger, EmptyState, Skeleton } from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { relativeTime } from '@/lib/utils';

type ActivityRow = {
  id: string;
  kind: string;
  title: string;
  href: string | null;
  createdAt: string;
};

const LABELS: Record<string, string> = {
  'file.upload': 'Added to library',
  'web.import': 'Imported page',
  'youtube.import': 'Imported video',
  'recording.transcribed': 'Transcript ready',
  'note.create': 'Note created',
  'agent.note': 'Agent wrote a note',
};

/** Activity feed — real events written by the ingest and tool pipelines. */
export function NotificationsPopover({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const { data, loading } = useApi<{ activity: ActivityRow[] }>(
    open ? '/api/home' : null,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2">
          <p className="text-xs font-medium text-fg">Activity</p>
        </div>
        <div className="max-h-80 overflow-y-auto p-1 scrollbar-thin">
          {loading ? (
            <div className="space-y-1 p-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : data?.activity.length ? (
            data.activity.map((item) => {
              const body = (
                <div className="flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-hover">
                  <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-fg">{item.title}</p>
                    <p className="text-2xs text-tertiary">
                      {LABELS[item.kind] ?? item.kind} · {relativeTime(item.createdAt)}
                    </p>
                  </div>
                </div>
              );
              return item.href ? (
                <Link key={item.id} href={item.href} onClick={() => setOpen(false)}>
                  {body}
                </Link>
              ) : (
                <div key={item.id}>{body}</div>
              );
            })
          ) : (
            <EmptyState
              compact
              icon={<Activity />}
              title="Nothing yet"
              description="Uploads, transcripts and generated work will appear here."
            />
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
