'use client';

import * as React from 'react';

import { cn } from '@/lib/utils';

const base =
  'w-full rounded-md border border-border bg-surface text-fg shadow-xs transition-[border-color,box-shadow] placeholder:text-tertiary hover:border-border-strong focus:border-accent focus:outline-none focus:ring-3 focus:ring-[var(--accent-subtle)] disabled:cursor-not-allowed disabled:opacity-50';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { inputSize?: 'sm' | 'md' | 'lg' }
>(({ className, inputSize = 'md', ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      base,
      inputSize === 'sm' && 'h-7 px-2 text-xs',
      inputSize === 'md' && 'h-8 px-2.5 text-sm',
      inputSize === 'lg' && 'h-10 px-3 text-md',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(base, 'resize-none px-2.5 py-2 text-sm leading-relaxed', className)}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

/** Textarea that grows with its content up to a max height. */
export function AutoTextarea({
  className,
  maxRows = 12,
  value,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { maxRows?: number }) {
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight || '20');
    const max = lineHeight * maxRows;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [value, maxRows]);

  return (
    <textarea
      ref={ref}
      value={value}
      className={cn(
        'w-full resize-none bg-transparent text-sm leading-relaxed text-fg placeholder:text-tertiary focus:outline-none scrollbar-thin',
        className,
      )}
      {...props}
    />
  );
}

export function Label({
  className,
  children,
  hint,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement> & { hint?: string }) {
  return (
    <label
      className={cn('flex items-baseline gap-2 text-xs font-medium text-secondary', className)}
      {...props}
    >
      {children}
      {hint ? <span className="font-normal text-tertiary">{hint}</span> : null}
    </label>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label ? <Label hint={hint}>{label}</Label> : null}
      {children}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
