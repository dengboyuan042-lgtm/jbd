'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

/** Standard page frame: sticky header strip, scrollable body, consistent gutters. */
export function Page({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('flex h-full min-h-0 flex-col', className)}>{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumb,
  children,
  className,
  sticky = true,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  sticky?: boolean;
}) {
  return (
    <div
      className={cn(
        'shrink-0 border-b border-border bg-bg px-5 py-3',
        sticky && 'sticky top-0 z-10',
        className,
      )}
    >
      <div className="flex min-h-7 items-center gap-3">
        <div className="min-w-0 flex-1">
          {breadcrumb ? <div className="mb-0.5">{breadcrumb}</div> : null}
          {title ? (
            <h1 className="truncate text-md font-medium tracking-tight text-fg">{title}</h1>
          ) : null}
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs text-tertiary">{subtitle}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function PageBody({
  children,
  className,
  width = 'wide',
}: {
  children: React.ReactNode;
  className?: string;
  width?: 'wide' | 'narrow' | 'full';
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
      <div
        className={cn(
          width === 'full' ? '' : 'mx-auto w-full px-5 py-5',
          width === 'wide' && 'max-w-6xl',
          width === 'narrow' && 'max-w-3xl',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
