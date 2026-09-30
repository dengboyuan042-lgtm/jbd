'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import {
  Bell,
  LogOut,
  Menu as MenuIcon,
  Monitor,
  Moon,
  PanelRight,
  Search,
  Settings,
  Sun,
} from 'lucide-react';

import { Avatar, Kbd, Tooltip } from '@/components/ui/primitives';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useWorkspace } from '@/features/workspace/workspace-context';
import { NotificationsPopover } from '@/features/notifications/notifications-popover';

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const router = useRouter();
  const { user, setCommandOpen, togglePanel, panelOpen, panel } = useWorkspace();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const signOut = async () => {
    await api.post('/api/auth/logout');
    router.replace('/login');
    router.refresh();
  };

  return (
    <header className="flex h-(--topbar-h) shrink-0 items-center gap-2 border-b border-border bg-bg px-3">
      <button
        type="button"
        onClick={onOpenMobileNav}
        className="-ml-1 rounded-md p-1.5 text-secondary transition-colors hover:bg-surface-hover hover:text-fg lg:hidden"
        aria-label="Open navigation"
      >
        <MenuIcon className="size-4" />
      </button>

      <button
        type="button"
        onClick={() => setCommandOpen(true)}
        className="group flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-left text-sm text-tertiary shadow-xs transition-[border-color,background-color] hover:border-border-strong hover:bg-surface-hover sm:max-w-md"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="flex-1 truncate">Search or ask anything</span>
        <Kbd className="hidden sm:inline-flex">mod K</Kbd>
      </button>

      <div className="flex flex-1 items-center justify-end gap-0.5">
        <NotificationsPopover>
          <button
            type="button"
            className="relative rounded-md p-1.5 text-secondary transition-colors hover:bg-surface-hover hover:text-fg"
            aria-label="Notifications"
          >
            <Bell className="size-4" />
          </button>
        </NotificationsPopover>

        {panel.mode === 'hidden' ? null : (
          <Tooltip content={panelOpen ? 'Hide panel' : 'Show panel'} shortcut="mod ." side="bottom">
            <button
              type="button"
              onClick={togglePanel}
              className={cn(
                'hidden rounded-md p-1.5 transition-colors hover:bg-surface-hover md:block',
                panelOpen ? 'text-fg' : 'text-tertiary hover:text-fg',
              )}
              aria-label="Toggle context panel"
            >
              <PanelRight className="size-4" />
            </button>
          </Tooltip>
        )}

        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className="ml-1 rounded-full outline-none ring-offset-2 transition-opacity hover:opacity-85"
              aria-label="Account"
            >
              <Avatar name={user.name} src={user.avatarUrl} size={24} />
            </button>
          </MenuTrigger>
          <MenuContent className="min-w-56">
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium text-fg">{user.name}</p>
              <p className="truncate text-xs text-tertiary">{user.email}</p>
            </div>
            <MenuSeparator />
            <MenuLabel>Appearance</MenuLabel>
            <div className="flex gap-0.5 p-1">
              {(
                [
                  { value: 'light', icon: Sun, label: 'Light' },
                  { value: 'dark', icon: Moon, label: 'Dark' },
                  { value: 'system', icon: Monitor, label: 'Auto' },
                ] as const
              ).map((option) => (
                <button
                  key={option.value}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-1 rounded-sm px-2 py-1.5 text-2xs transition-colors',
                    mounted && theme === option.value
                      ? 'bg-surface-active text-fg'
                      : 'text-tertiary hover:bg-surface-hover hover:text-secondary',
                  )}
                >
                  <option.icon className="size-3.5" />
                  {option.label}
                </button>
              ))}
            </div>
            <MenuSeparator />
            <MenuItem icon={<Settings />} onSelect={() => router.push('/settings')}>
              Settings
            </MenuItem>
            <MenuItem icon={<LogOut />} destructive onSelect={signOut}>
              Sign out
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </header>
  );
}
