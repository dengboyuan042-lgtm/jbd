'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import {
  ArrowRight,
  Blocks,
  FileText,
  FolderKanban,
  Globe,
  GraduationCap,
  House,
  Library,
  Link2,
  Mic,
  NotebookPen,
  Search,
  Settings,
  Sparkles,
  SquareCheckBig,
  Upload,
  Youtube,
} from 'lucide-react';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Kbd, Spinner } from '@/components/ui/primitives';
import { useApi, useDebouncedValue } from '@/hooks/use-api';
import { cn, formatDuration, relativeTime } from '@/lib/utils';
import { useWorkspace } from '@/features/workspace/workspace-context';

type SearchHit = {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceKind: string;
  highlights: string[];
  page: number | null;
  startTime: number | null;
};

type Entities = {
  sources: { id: string; title: string; kind: string; updatedAt: string }[];
  projects: { id: string; name: string }[];
  notes: { id: string; title: string; updatedAt: string }[];
  chats: { id: string; title: string }[];
};

type SearchResponse = {
  hits: SearchHit[];
  entities: Entities | null;
  intent: { applied: string[] } | null;
  tookMs: number;
};

const KIND_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  file: FileText,
  note: NotebookPen,
  recording: Mic,
  webpage: Globe,
  youtube: Youtube,
  chat: Sparkles,
};

/**
 * One surface for navigation, search and actions. Content search runs the
 * hybrid retriever, so the palette finds a sentence inside a PDF, not just
 * file names.
 */
export function CommandPalette() {
  const router = useRouter();
  const { commandOpen, setCommandOpen } = useWorkspace();
  const [query, setQuery] = React.useState('');
  const debounced = useDebouncedValue(query, 180);

  const { data, loading } = useApi<SearchResponse>(
    commandOpen ? `/api/search?q=${encodeURIComponent(debounced)}&limit=8` : null,
  );

  React.useEffect(() => {
    if (!commandOpen) setQuery('');
  }, [commandOpen]);

  const go = (href: string) => {
    setCommandOpen(false);
    router.push(href);
  };

  const askAi = () => {
    if (!query.trim()) return;
    setCommandOpen(false);
    router.push(`/chat?q=${encodeURIComponent(query)}`);
  };

  return (
    <Dialog open={commandOpen} onOpenChange={setCommandOpen}>
      <DialogContent
        size="lg"
        hideClose
        className="top-[16%] translate-y-0 overflow-hidden p-0"
        aria-describedby={undefined}
      >
        <Command
          shouldFilter={false}
          loop
          className="flex max-h-[min(30rem,70dvh)] flex-col"
        >
          <div className="flex items-center gap-2.5 border-b border-border px-3.5">
            <Search className="size-4 shrink-0 text-tertiary" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              autoFocus
              placeholder="Search your workspace, or ask a question…"
              className="h-11 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-tertiary"
            />
            {loading ? <Spinner className="size-3.5" /> : null}
            <Kbd>esc</Kbd>
          </div>

          {data?.intent?.applied?.length ? (
            <div className="flex flex-wrap gap-1 border-b border-border px-3.5 py-1.5">
              {data.intent.applied.map((filter) => (
                <span
                  key={filter}
                  className="rounded-xs bg-accent-subtle px-1.5 py-0.5 text-2xs text-accent-text"
                >
                  {filter}
                </span>
              ))}
            </div>
          ) : null}

          <Command.List className="min-h-0 flex-1 overflow-y-auto p-1.5 scrollbar-thin">
            <Command.Empty className="px-3 py-8 text-center text-xs text-tertiary">
              {loading ? 'Searching…' : 'No matches. Press Enter to ask the assistant.'}
            </Command.Empty>

            {query.trim() ? (
              <Group heading="Ask">
                <Item onSelect={askAi} icon={<Sparkles />}>
                  <span className="truncate">
                    Ask the assistant: <span className="text-fg">{query}</span>
                  </span>
                  <Kbd className="ml-auto">↵</Kbd>
                </Item>
              </Group>
            ) : null}

            {data?.hits?.length ? (
              <Group heading="In your content">
                {data.hits.map((hit) => {
                  const Icon = KIND_ICONS[hit.sourceKind] ?? FileText;
                  const locator =
                    hit.page != null
                      ? `p. ${hit.page}`
                      : hit.startTime != null
                        ? formatDuration(hit.startTime)
                        : null;
                  return (
                    <Item
                      key={hit.chunkId}
                      icon={<Icon />}
                      onSelect={() =>
                        go(
                          `/library/${hit.sourceId}${
                            hit.page != null
                              ? `?page=${hit.page}`
                              : hit.startTime != null
                                ? `?t=${Math.floor(hit.startTime)}`
                                : ''
                          }`,
                        )
                      }
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-fg">{hit.sourceTitle}</span>
                        <span className="block truncate text-2xs text-tertiary">
                          {hit.highlights[0]}
                        </span>
                      </span>
                      {locator ? (
                        <span className="shrink-0 rounded-xs bg-bg-sunken px-1 text-2xs text-tertiary">
                          {locator}
                        </span>
                      ) : null}
                    </Item>
                  );
                })}
              </Group>
            ) : null}

            {data?.entities?.sources.length ? (
              <Group heading="Library">
                {data.entities.sources.map((source) => {
                  const Icon = KIND_ICONS[source.kind] ?? FileText;
                  return (
                    <Item
                      key={source.id}
                      icon={<Icon />}
                      onSelect={() => go(`/library/${source.id}`)}
                    >
                      <span className="flex-1 truncate">{source.title}</span>
                      <span className="shrink-0 text-2xs text-tertiary">
                        {relativeTime(source.updatedAt)}
                      </span>
                    </Item>
                  );
                })}
              </Group>
            ) : null}

            {data?.entities?.projects.length ? (
              <Group heading="Projects">
                {data.entities.projects.map((project) => (
                  <Item
                    key={project.id}
                    icon={<FolderKanban />}
                    onSelect={() => go(`/projects/${project.id}`)}
                  >
                    <span className="flex-1 truncate">{project.name}</span>
                  </Item>
                ))}
              </Group>
            ) : null}

            {data?.entities?.notes.length ? (
              <Group heading="Notes">
                {data.entities.notes.map((note) => (
                  <Item
                    key={note.id}
                    icon={<NotebookPen />}
                    onSelect={() => go(`/notes/${note.id}`)}
                  >
                    <span className="flex-1 truncate">{note.title}</span>
                  </Item>
                ))}
              </Group>
            ) : null}

            {!query.trim() ? (
              <>
                <Group heading="Actions">
                  <Item icon={<Upload />} onSelect={() => go('/library?upload=1')}>
                    Upload files
                  </Item>
                  <Item icon={<Link2 />} onSelect={() => go('/library?import=1')}>
                    Import a link or video
                  </Item>
                  <Item icon={<Mic />} onSelect={() => go('/record?start=1')}>
                    Start recording
                  </Item>
                  <Item icon={<NotebookPen />} onSelect={() => go('/notes?new=1')}>
                    New note
                  </Item>
                  <Item icon={<FolderKanban />} onSelect={() => go('/projects?new=1')}>
                    New project
                  </Item>
                </Group>
                <Group heading="Go to">
                  <Item icon={<House />} onSelect={() => go('/')}>Home</Item>
                  <Item icon={<Library />} onSelect={() => go('/library')}>Library</Item>
                  <Item icon={<Sparkles />} onSelect={() => go('/chat')}>AI</Item>
                  <Item icon={<Blocks />} onSelect={() => go('/tools')}>Tools</Item>
                  <Item icon={<GraduationCap />} onSelect={() => go('/study')}>Study</Item>
                  <Item icon={<SquareCheckBig />} onSelect={() => go('/tasks')}>Tasks</Item>
                  <Item icon={<Search />} onSelect={() => go('/search')}>Advanced search</Item>
                  <Item icon={<Settings />} onSelect={() => go('/settings')}>Settings</Item>
                </Group>
              </>
            ) : null}
          </Command.List>

          <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 text-2xs text-tertiary">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> open
            </span>
            {data?.tookMs ? <span className="ml-auto">{data.tookMs} ms</span> : null}
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.07em] [&_[cmdk-group-heading]]:text-tertiary"
    >
      {children}
    </Command.Group>
  );
}

function Item({
  children,
  icon,
  onSelect,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className={cn(
        'flex h-8 cursor-pointer select-none items-center gap-2.5 rounded-md px-2 text-sm text-secondary',
        'data-[selected=true]:bg-surface-hover data-[selected=true]:text-fg',
        '[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-tertiary',
      )}
    >
      {icon}
      {children}
      <ArrowRight className="ml-auto hidden size-3 opacity-0 data-[selected=true]:opacity-100" />
    </Command.Item>
  );
}
