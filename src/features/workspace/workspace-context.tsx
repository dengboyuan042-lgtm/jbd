'use client';

import * as React from 'react';

export type PanelMode =
  | 'chat'
  | 'live'
  | 'writing'
  | 'project'
  | 'reader'
  | 'hidden';

export type PanelState = {
  mode: PanelMode;
  /** heading shown at the top of the panel */
  title?: string;
  /** sources the panel should ground answers in */
  sourceIds?: string[];
  projectId?: string | null;
  /** free-form payload for specialised panels */
  payload?: Record<string, unknown>;
};

export type WorkspaceUser = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  locale: string;
  settings: Record<string, unknown>;
};

type WorkspaceValue = {
  user: WorkspaceUser;
  panel: PanelState;
  setPanel: (state: PanelState) => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  /** page-level hook to jump to a citation target inside the current view */
  citationHandler: ((citation: CitationTarget) => boolean) | null;
  registerCitationHandler: (
    handler: ((citation: CitationTarget) => boolean) | null,
  ) => void;
};

export type CitationTarget = {
  sourceId: string;
  chunkId?: string;
  page?: number;
  time?: number;
  section?: string;
};

const WorkspaceContext = React.createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({
  user,
  children,
}: {
  user: WorkspaceUser;
  children: React.ReactNode;
}) {
  const [panel, setPanelState] = React.useState<PanelState>({ mode: 'chat' });
  const [panelOpen, setPanelOpen] = React.useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);
  const [commandOpen, setCommandOpen] = React.useState(false);
  const handlerRef = React.useRef<((c: CitationTarget) => boolean) | null>(null);
  const [, force] = React.useReducer((n: number) => n + 1, 0);

  const setPanel = React.useCallback((state: PanelState) => {
    setPanelState((prev) => {
      if (
        prev.mode === state.mode &&
        prev.title === state.title &&
        prev.projectId === state.projectId &&
        sameIds(prev.sourceIds, state.sourceIds)
      ) {
        return prev;
      }
      return state;
    });
  }, []);

  const registerCitationHandler = React.useCallback(
    (handler: ((c: CitationTarget) => boolean) | null) => {
      handlerRef.current = handler;
      force();
    },
    [],
  );

  const value = React.useMemo<WorkspaceValue>(
    () => ({
      user,
      panel,
      setPanel,
      panelOpen,
      setPanelOpen,
      togglePanel: () => setPanelOpen((v) => !v),
      sidebarCollapsed,
      setSidebarCollapsed,
      commandOpen,
      setCommandOpen,
      citationHandler: handlerRef.current,
      registerCitationHandler,
    }),
    [
      user,
      panel,
      setPanel,
      panelOpen,
      sidebarCollapsed,
      commandOpen,
      registerCitationHandler,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceValue {
  const context = React.useContext(WorkspaceContext);
  if (!context) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return context;
}

/** Declare what the right-hand panel should show for the current page. */
export function usePanel(state: PanelState, deps: React.DependencyList = []) {
  const { setPanel } = useWorkspace();
  React.useEffect(() => {
    setPanel(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function sameIds(a?: string[], b?: string[]): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
