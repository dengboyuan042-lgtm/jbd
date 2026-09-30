'use client';

import * as React from 'react';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';

import { cn } from '@/lib/utils';

/* ────────────────────────────── Dropdown ────────────────────────────── */

export const Menu = DropdownPrimitive.Root;
export const MenuTrigger = DropdownPrimitive.Trigger;
export const MenuSub = DropdownPrimitive.Sub;
export const MenuSubTrigger = DropdownPrimitive.SubTrigger;

export function MenuContent({
  className,
  align = 'end',
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Content>) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-44 overflow-hidden rounded-lg border border-border bg-overlay p-1 shadow-lg animate-scale-in',
          className,
        )}
        {...props}
      />
    </DropdownPrimitive.Portal>
  );
}

export function MenuItem({
  className,
  destructive,
  shortcut,
  icon,
  children,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.Item> & {
  destructive?: boolean;
  shortcut?: string;
  icon?: React.ReactNode;
}) {
  return (
    <DropdownPrimitive.Item
      className={cn(
        'flex h-7 cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-sm outline-none transition-colors',
        'data-[highlighted]:bg-surface-hover',
        destructive ? 'text-danger data-[highlighted]:bg-danger-subtle' : 'text-secondary data-[highlighted]:text-fg',
        '[&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-tertiary',
        className,
      )}
      {...props}
    >
      {icon}
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <span className="text-2xs text-tertiary">{shortcut}</span> : null}
    </DropdownPrimitive.Item>
  );
}

export function MenuLabel({ className, ...props }: React.ComponentProps<typeof DropdownPrimitive.Label>) {
  return (
    <DropdownPrimitive.Label
      className={cn('px-2 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wide text-tertiary', className)}
      {...props}
    />
  );
}

export function MenuSeparator({ className, ...props }: React.ComponentProps<typeof DropdownPrimitive.Separator>) {
  return <DropdownPrimitive.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />;
}

export function MenuCheckboxItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DropdownPrimitive.CheckboxItem>) {
  return (
    <DropdownPrimitive.CheckboxItem
      className={cn(
        'flex h-7 cursor-pointer select-none items-center gap-2 rounded-sm pl-7 pr-2 text-sm text-secondary outline-none transition-colors data-[highlighted]:bg-surface-hover data-[highlighted]:text-fg',
        className,
      )}
      {...props}
    >
      <DropdownPrimitive.ItemIndicator className="absolute left-2">
        <Check className="size-3.5" />
      </DropdownPrimitive.ItemIndicator>
      {children}
    </DropdownPrimitive.CheckboxItem>
  );
}

/* ────────────────────────────── Select ──────────────────────────────── */

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({
  className,
  children,
  size = 'md',
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & { size?: 'sm' | 'md' }) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'inline-flex w-full items-center justify-between gap-2 rounded-md border border-border bg-surface text-fg shadow-xs transition-colors hover:border-border-strong focus:outline-none focus:ring-3 focus:ring-[var(--accent-subtle)] data-[placeholder]:text-tertiary',
        size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-2.5 text-sm',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDown className="size-3.5 text-tertiary" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

export function SelectContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        position="popper"
        sideOffset={5}
        className={cn(
          'z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg border border-border bg-overlay p-1 shadow-lg animate-scale-in',
          className,
        )}
        {...props}
      >
        <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}

export function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex h-7 cursor-pointer select-none items-center rounded-sm pl-7 pr-2 text-sm text-secondary outline-none data-[highlighted]:bg-surface-hover data-[highlighted]:text-fg data-[state=checked]:text-fg',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ItemIndicator className="absolute left-2">
        <Check className="size-3.5" />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export function SelectLabel({ className, ...props }: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      className={cn('px-2 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wide text-tertiary', className)}
      {...props}
    />
  );
}
