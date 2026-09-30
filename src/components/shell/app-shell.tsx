'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';

import { Drawer } from '@/components/ui/dialog';
import { useHotkey, useLocalState } from '@/hooks/use-api';
import { cn } from '@/lib/utils';
import {
  WorkspaceProvider,
  useWorkspace,
  type WorkspaceUser,
} from '@/features/workspace/workspace-context';
import { CommandPalette } from '@/features/command/command-palette';
import { ContextPanel } from './context-panel';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function AppShell({
  user,
  children,
}: {
  user: WorkspaceUser;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceProvider user={user}>
      <ShellFrame>{children}</ShellFrame>
    </WorkspaceProvider>
  );
}

function ShellFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const {
    panel,
    panelOpen,
    setPanelOpen,
    togglePanel,
    setCommandOpen,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = useWorkspace();

  const [mobileNav, setMobileNav] = React.useState(false);
  const [mobilePanel, setMobilePanel] = React.useState(false);
  const [storedCollapsed, setStoredCollapsed, hydrated] = useLocalState(
    'ui.sidebar.collapsed',
    false,
  );

  React.useEffect(() => {
    if (hydrated) setSidebarCollapsed(storedCollapsed);
  }, [hydrated, storedCollapsed, setSidebarCollapsed]);

  React.useEffect(() => {
    if (hydrated && sidebarCollapsed !== storedCollapsed) setStoredCollapsed(sidebarCollapsed);
  }, [sidebarCollapsed, hydrated, storedCollapsed, setStoredCollapsed]);

  React.useEffect(() => setMobileNav(false), [pathname]);

  useHotkey('mod+k', (e) => {
    e.preventDefault();
    setCommandOpen(true);
  }, { allowInInput: true });

  useHotkey('mod+.', (e) => {
    e.preventDefault();
    togglePanel();
  }, { allowInInput: true });

  useHotkey('mod+\\', (e) => {
    e.preventDefault();
    setSidebarCollapsed(!sidebarCollapsed);
  }, { allowInInput: true });

  const showPanel = panel.mode !== 'hidden';

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg">
      <div className="hidden shrink-0 border-r border-border lg:block">
        <Sidebar />
      </div>

      <Drawer open={mobileNav} onOpenChange={setMobileNav} side="left">
        <Sidebar onNavigate={() => setMobileNav(false)} />
      </Drawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileNav(true)} />

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-hidden">{children}</main>

          {showPanel && panelOpen ? (
            <div className="hidden w-(--panel-w) shrink-0 md:block xl:w-(--panel-w)">
              <ContextPanel />
            </div>
          ) : null}
        </div>
      </div>

      {showPanel ? (
        <>
          <button
            type="button"
            onClick={() => setMobilePanel(true)}
            className={cn(
              'fixed bottom-5 right-4 z-30 flex size-11 items-center justify-center rounded-full bg-fg text-inverse shadow-pop transition-transform active:scale-95 md:hidden',
            )}
            aria-label="Open assistant"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m12 3 1.9 4.9L19 9.8l-4.2 3.1L15.6 18 12 15.2 8.4 18l.8-5.1L5 9.8l5.1-.9L12 3Z" />
            </svg>
          </button>
          <Drawer open={mobilePanel} onOpenChange={setMobilePanel} side="bottom" className="h-[85dvh]">
            <div className="min-h-0 flex-1">
              <ContextPanel />
            </div>
          </Drawer>
        </>
      ) : null}

      {!panelOpen && showPanel ? (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="fixed bottom-5 right-4 z-20 hidden h-8 items-center gap-1.5 rounded-full border border-border bg-overlay px-3 text-xs font-medium text-secondary shadow-md transition-colors hover:text-fg md:flex"
        >
          Assistant
        </button>
      ) : null}

      <CommandPalette />
    </div>
  );
}
