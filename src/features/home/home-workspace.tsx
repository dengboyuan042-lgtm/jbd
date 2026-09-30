'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  FileText,
  FolderKanban,
  Globe,
  Link2,
  Mic,
  NotebookPen,
  Sparkles,
  Upload,
  Youtube,
} from 'lucide-react';

import { Page, PageBody } from '@/components/shell/page';
import { EmptyState, Skeleton } from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { cn, relativeTime } from '@/lib/utils';
import { usePanel, useWorkspace } from '@/features/workspace/workspace-context';
import { ChatComposer } from '@/features/chat/chat-composer';
import { UploadDialog } from '@/features/library/upload-dialog';
import { ImportDialog } from '@/features/library/import-dialog';

type HomeData = {
  sources: { id: string; title: string; kind: string; summary: string | null; updatedAt: string }[];
  projects: { id: string; name: string; color: string; sourceCount?: number }[];
  notes: { id: string; title: string; updatedAt: string }[];
  chats: { id: string; title: string; updatedAt: string }[];
  recordings: { id: string; title: string; status: string; createdAt: string }[];
  tasks: { id: string; title: string; dueAt: string | null; status: string }[];
  stats: { dueCards: number; unindexed: number; openTasks: number };
  suggestions: { id: string; label: string; detail: string; href: string }[];
};

const KIND_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  file: FileText,
  note: NotebookPen,
  recording: Mic,
  webpage: Globe,
  youtube: Youtube,
  chat: Sparkles,
};

export function HomeWorkspace() {
  const router = useRouter();
  const { user } = useWorkspace();
  const { data, loading, refresh } = useApi<HomeData>('/api/home');
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);

  usePanel({ mode: 'chat', title: 'Assistant' }, []);

  const firstName = user.name.split(' ')[0];
  const greeting = React.useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 5) return 'Still up';
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const startChat = async (content: string, options: { agent: boolean }) => {
    const params = new URLSearchParams({ q: content });
    if (options.agent) params.set('agent', '1');
    router.push(`/chat?${params.toString()}`);
  };

  return (
    <Page>
      <PageBody width="wide" className="max-w-5xl">
        <div className="animate-rise space-y-8">
          <section className="space-y-4 pt-6">
            <div>
              <h1 className="text-2xl font-medium tracking-tight text-fg">
                {greeting}, {firstName}
              </h1>
              <p className="mt-1 text-sm text-tertiary">
                Tell me what you want to do, or pick up where you left off.
              </p>
            </div>

            <ChatComposer
              autoFocus
              placeholder="Summarise my last meeting, build a quiz from the syllabus, find what we decided about pricing…"
              onSubmit={(content, options) => startChat(content, options)}
            />

            <div className="flex flex-wrap gap-1.5">
              <QuickAction icon={<Upload />} label="Upload" onClick={() => setUploadOpen(true)} />
              <QuickAction icon={<Link2 />} label="Import link" onClick={() => setImportOpen(true)} />
              <QuickAction icon={<Mic />} label="Record" onClick={() => router.push('/record?start=1')} />
              <QuickAction icon={<NotebookPen />} label="New note" onClick={() => router.push('/notes?new=1')} />
              <QuickAction
                icon={<FolderKanban />}
                label="New project"
                onClick={() => router.push('/projects?new=1')}
              />
            </div>
          </section>

          {loading ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              {data?.suggestions.length ? (
                <section className="space-y-2">
                  <SectionTitle>Suggested</SectionTitle>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {data.suggestions.map((suggestion) => (
                      <Link
                        key={suggestion.id}
                        href={suggestion.href}
                        className="group flex items-start gap-2.5 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:border-border-strong"
                      >
                        <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent-text">
                          <Sparkles className="size-3" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-fg">{suggestion.label}</span>
                          <span className="block truncate text-xs text-tertiary">
                            {suggestion.detail}
                          </span>
                        </span>
                        <ArrowRight className="mt-1 size-3.5 shrink-0 text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    ))}
                  </div>
                </section>
              ) : null}

              <section className="space-y-2">
                <SectionTitle action={<Link href="/library" className="text-2xs text-accent-text hover:underline">All</Link>}>
                  Continue working
                </SectionTitle>
                {data?.sources.length ? (
                  <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
                    {data.sources.slice(0, 6).map((source) => {
                      const Icon = KIND_ICONS[source.kind] ?? FileText;
                      return (
                        <Link
                          key={source.id}
                          href={`/library/${source.id}`}
                          className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-hover"
                        >
                          <Icon className="size-4 shrink-0 text-tertiary" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-fg">{source.title}</span>
                            {source.summary ? (
                              <span className="block truncate text-xs text-tertiary">
                                {source.summary}
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 text-2xs text-tertiary">
                            {relativeTime(source.updatedAt)}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon={<Upload />}
                    title="Your library is empty"
                    description="Upload a document, import a link, or record a session to get started."
                  />
                )}
              </section>

              <div className="grid gap-4 md:grid-cols-2">
                <section className="space-y-2">
                  <SectionTitle
                    action={
                      <Link href="/projects" className="text-2xs text-accent-text hover:underline">
                        All
                      </Link>
                    }
                  >
                    Projects
                  </SectionTitle>
                  {data?.projects.length ? (
                    <div className="space-y-1">
                      {data.projects.slice(0, 4).map((project) => (
                        <Link
                          key={project.id}
                          href={`/projects/${project.id}`}
                          className="flex items-center gap-2.5 rounded-md border border-border bg-surface px-3 py-2 transition-colors hover:border-border-strong"
                        >
                          <FolderKanban className="size-3.5 text-tertiary" />
                          <span className="min-w-0 flex-1 truncate text-sm text-fg">
                            {project.name}
                          </span>
                          {project.sourceCount ? (
                            <span className="text-2xs text-tertiary">{project.sourceCount}</span>
                          ) : null}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-tertiary">
                      No projects yet.
                    </p>
                  )}
                </section>

                <section className="space-y-2">
                  <SectionTitle
                    action={
                      <Link href="/chat" className="text-2xs text-accent-text hover:underline">
                        All
                      </Link>
                    }
                  >
                    Recent conversations
                  </SectionTitle>
                  {data?.chats.length ? (
                    <div className="space-y-1">
                      {data.chats.slice(0, 4).map((chat) => (
                        <Link
                          key={chat.id}
                          href={`/chat/${chat.id}`}
                          className="flex items-center gap-2.5 rounded-md border border-border bg-surface px-3 py-2 transition-colors hover:border-border-strong"
                        >
                          <Sparkles className="size-3.5 text-tertiary" />
                          <span className="min-w-0 flex-1 truncate text-sm text-fg">
                            {chat.title}
                          </span>
                          <span className="shrink-0 text-2xs text-tertiary">
                            {relativeTime(chat.updatedAt)}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-tertiary">
                      Nothing yet.
                    </p>
                  )}
                </section>
              </div>
            </>
          )}
        </div>
      </PageBody>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onDone={refresh} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onDone={refresh} />
    </Page>
  );
}

function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-2xs font-semibold uppercase tracking-[0.07em] text-tertiary">
        {children}
      </h2>
      {action}
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs text-secondary shadow-xs transition-colors hover:border-border-strong hover:text-fg',
        '[&_svg]:size-3.5 [&_svg]:text-tertiary',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
