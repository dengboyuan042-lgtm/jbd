'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Blocks,
  ChevronsLeft,
  FolderKanban,
  GraduationCap,
  House,
  Library,
  Mic,
  NotebookPen,
  Search,
  Settings,
  Sparkles,
  SquareCheckBig,
} from 'lucide-react';

import { Tooltip } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import { product } from '@/lib/product';
import { useWorkspace } from '@/features/workspace/workspace-context';

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
};

const PRIMARY: NavItem[] = [
  { href: '/', label: 'Home', icon: House },
  { href: '/library', label: 'Library', icon: Library },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/notes', label: 'Notes', icon: NotebookPen },
  { href: '/record', label: 'Record', icon: Mic },
  { href: '/search', label: 'Search', icon: Search },
];

const SECONDARY: NavItem[] = [
  { href: '/chat', label: 'AI', icon: Sparkles },
  { href: '/tools', label: 'Tools', icon: Blocks },
  { href: '/study', label: 'Study', icon: GraduationCap },
  { href: '/tasks', label: 'Tasks', icon: SquareCheckBig },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed } = useWorkspace();
  const collapsed = sidebarCollapsed;

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  const renderItem = (item: NavItem) => {
    const active = isActive(item.href);
    const link = (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        className={cn(
          'group relative flex h-7 items-center gap-2.5 rounded-md px-2 text-sm transition-colors duration-100',
          collapsed && 'justify-center px-0',
          active
            ? 'bg-surface-active font-medium text-fg'
            : 'text-secondary hover:bg-surface-hover hover:text-fg',
        )}
      >
        <item.icon className={cn('size-4 shrink-0', active ? 'text-fg' : 'text-tertiary')} />
        {collapsed ? null : <span className="truncate">{item.label}</span>}
      </Link>
    );
    return collapsed ? (
      <Tooltip key={item.href} content={item.label} side="right">
        {link}
      </Tooltip>
    ) : (
      link
    );
  };

  return (
    <nav
      className={cn(
        'flex h-full flex-col bg-bg-subtle transition-[width] duration-200 ease-[var(--ease-out-quint)]',
        collapsed ? 'w-[52px]' : 'w-(--sidebar-w)',
      )}
    >
      <div
        className={cn(
          'flex h-(--topbar-h) shrink-0 items-center gap-2',
          collapsed ? 'justify-center px-0' : 'px-3',
        )}
      >
        <Link href="/" className="flex items-center gap-2 overflow-hidden" onClick={onNavigate}>
          <span className="flex size-[22px] shrink-0 items-center justify-center rounded-md bg-fg text-inverse">
            <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H18a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 17.5v-12Z" />
              <path d="M8 7.5h7M8 11h5" strokeLinecap="round" />
            </svg>
          </span>
          {collapsed ? null : (
            <span className="truncate text-sm font-medium tracking-tight text-fg">
              {product.name}
            </span>
          )}
        </Link>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-2 pt-1 scrollbar-none">
        <div className="space-y-0.5">{PRIMARY.map(renderItem)}</div>
        <div className="space-y-0.5">
          {collapsed ? null : (
            <p className="px-2 pb-1 text-2xs font-semibold uppercase tracking-[0.07em] text-tertiary">
              Work
            </p>
          )}
          {SECONDARY.map(renderItem)}
        </div>
      </div>

      <div className="space-y-0.5 px-2 pb-2">
        {renderItem({ href: '/settings', label: 'Settings', icon: Settings })}
        <button
          type="button"
          onClick={() => setSidebarCollapsed(!collapsed)}
          className={cn(
            'flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-sm text-tertiary transition-colors hover:bg-surface-hover hover:text-fg',
            collapsed && 'justify-center px-0',
          )}
        >
          <ChevronsLeft
            className={cn('size-4 transition-transform duration-200', collapsed && 'rotate-180')}
          />
          {collapsed ? null : <span>Collapse</span>}
        </button>
      </div>
    </nav>
  );
}
