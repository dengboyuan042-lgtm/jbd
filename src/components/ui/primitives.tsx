'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import * as RadioPrimitive from '@radix-ui/react-radio-group';
import * as SliderPrimitive from '@radix-ui/react-slider';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Check, Minus } from 'lucide-react';

import { cn, initials as toInitials, isMac } from '@/lib/utils';

/* ────────────────────────────── Card ─────────────────────────────────── */

export function Card({
  className,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface shadow-xs',
        interactive &&
          'cursor-pointer transition-[border-color,box-shadow,transform] duration-150 hover:border-border-strong hover:shadow-sm active:scale-[0.997]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 pt-3.5 pb-2', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-sm font-medium text-fg', className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-4 pb-4', className)} {...props} />;
}

/* ────────────────────────────── Tooltip ──────────────────────────────── */

export function Tooltip({
  children,
  content,
  side = 'bottom',
  shortcut,
  delay,
}: {
  children: React.ReactNode;
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  shortcut?: string;
  delay?: number;
}) {
  if (!content) return <>{children}</>;
  return (
    <TooltipPrimitive.Root delayDuration={delay}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 flex items-center gap-1.5 rounded-md border border-border bg-overlay px-2 py-1 text-xs text-fg shadow-md animate-scale-in"
        >
          {content}
          {shortcut ? <Kbd>{shortcut}</Kbd> : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ────────────────────────────── Kbd ──────────────────────────────────── */

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  const [mac, setMac] = React.useState(false);
  React.useEffect(() => setMac(isMac()), []);
  const text =
    typeof children === 'string'
      ? children.replace('mod', mac ? '⌘' : 'Ctrl').replace('alt', mac ? '⌥' : 'Alt')
      : children;
  return (
    <kbd
      className={cn(
        'inline-flex h-4.5 min-w-4.5 items-center justify-center rounded-xs border border-border bg-bg-sunken px-1 font-sans text-2xs font-medium text-tertiary',
        className,
      )}
    >
      {text}
    </kbd>
  );
}

/* ────────────────────────────── Badge ────────────────────────────────── */

export function Badge({
  className,
  tone = 'neutral',
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
}) {
  const tones = {
    neutral: 'border-border bg-bg-sunken text-secondary',
    accent: 'border-[var(--accent-border)] bg-accent-subtle text-accent-text',
    success: 'border-transparent bg-success-subtle text-success',
    warning: 'border-transparent bg-warning-subtle text-warning',
    danger: 'border-danger-border bg-danger-subtle text-danger',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex h-4.5 items-center gap-1 rounded-xs border px-1.5 text-2xs font-medium',
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

/* ────────────────────────────── Separator ────────────────────────────── */

export function Separator({
  className,
  orientation = 'horizontal',
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
      {...props}
    />
  );
}

/* ────────────────────────────── ScrollArea ───────────────────────────── */

export function ScrollArea({
  className,
  viewportRef,
  children,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <ScrollAreaPrimitive.Root
      className={cn('relative overflow-hidden', className)}
      scrollHideDelay={600}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        className="size-full [&>div]:!block"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation="vertical"
        className="flex w-2 touch-none select-none p-0.5 transition-opacity data-[state=hidden]:opacity-0"
      >
        <ScrollAreaPrimitive.Thumb className="flex-1 rounded-full bg-border-strong" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

/* ────────────────────────────── Tabs ─────────────────────────────────── */

export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn('flex items-center gap-0.5 border-b border-border', className)}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative -mb-px h-8 rounded-t-sm px-2.5 text-xs font-medium text-tertiary transition-colors hover:text-fg data-[state=active]:text-fg',
        'after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-transparent data-[state=active]:after:bg-fg',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('focus:outline-none animate-fade-in', className)}
      {...props}
    />
  );
}

/** Pill-style segmented control for in-panel view switching. */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ReactNode }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-md border border-border bg-bg-sunken p-0.5',
        className,
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onValueChange(option.value)}
          className={cn(
            'inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-xs font-medium transition-colors',
            value === option.value
              ? 'bg-surface text-fg shadow-xs'
              : 'text-tertiary hover:text-secondary',
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}

/* ────────────────────────────── Switch ───────────────────────────────── */

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-4.5 w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-border-strong transition-colors data-[state=checked]:bg-accent disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-3.5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}

/* ────────────────────────────── Checkbox ─────────────────────────────── */

export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-xs border border-border-strong bg-surface transition-colors data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="text-white">
        {props.checked === 'indeterminate' ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

/* ────────────────────────────── Radio ────────────────────────────────── */

export const RadioGroup = RadioPrimitive.Root;

export function RadioItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioPrimitive.Item>) {
  return (
    <RadioPrimitive.Item
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface transition-colors data-[state=checked]:border-accent',
        className,
      )}
      {...props}
    >
      <RadioPrimitive.Indicator className="size-2 rounded-full bg-accent" />
    </RadioPrimitive.Item>
  );
}

/* ────────────────────────────── Slider ───────────────────────────────── */

export function Slider({ className, ...props }: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn('relative flex w-full touch-none select-none items-center', className)}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-border">
        <SliderPrimitive.Range className="absolute h-full bg-fg" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block size-3 rounded-full border border-border-strong bg-surface shadow-sm transition-transform hover:scale-110 focus-visible:outline-none" />
    </SliderPrimitive.Root>
  );
}

/* ────────────────────────────── Progress ─────────────────────────────── */

export function Progress({
  value,
  className,
  tone = 'accent',
}: {
  value: number;
  className?: string;
  tone?: 'accent' | 'success' | 'danger';
}) {
  const tones = { accent: 'bg-accent', success: 'bg-success', danger: 'bg-danger' };
  return (
    <ProgressPrimitive.Root
      value={value}
      className={cn('relative h-1 w-full overflow-hidden rounded-full bg-border', className)}
    >
      <ProgressPrimitive.Indicator
        className={cn('size-full transition-transform duration-500 ease-out', tones[tone])}
        style={{ transform: `translateX(-${100 - Math.min(Math.max(value, 0), 100)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

/* ────────────────────────────── Avatar ───────────────────────────────── */

export function Avatar({
  name,
  src,
  size = 24,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-bg-sunken align-middle',
        className,
      )}
      style={{ width: size, height: size }}
    >
      {src ? <AvatarPrimitive.Image src={src} alt={name} className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback
        className="flex size-full items-center justify-center bg-accent-subtle font-medium text-accent-text"
        style={{ fontSize: Math.max(9, size * 0.38) }}
      >
        {toInitials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

/* ────────────────────────────── Popover ──────────────────────────────── */

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  align = 'start',
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          'z-50 min-w-48 rounded-lg border border-border bg-overlay p-1 shadow-lg animate-scale-in',
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

/* ────────────────────────────── Skeleton ─────────────────────────────── */

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-sm bg-bg-sunken', className)}
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-[var(--surface-hover)] to-transparent" />
    </div>
  );
}

/* ────────────────────────────── States ───────────────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-6 py-8' : 'gap-3 px-6 py-16',
        className,
      )}
    >
      {icon ? (
        <div className="flex size-9 items-center justify-center rounded-lg border border-border bg-bg-sunken text-tertiary [&_svg]:size-4">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-tertiary text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="flex size-9 items-center justify-center rounded-lg border border-danger-border bg-danger-subtle text-danger">
        <svg viewBox="0 0 24 24" fill="none" className="size-4" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
        </svg>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-fg">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-xs text-tertiary">{description}</p>
        ) : null}
      </div>
      {onRetry ? (
        <button
          onClick={onRetry}
          className="text-xs font-medium text-accent-text hover:underline"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

/* ────────────────────────────── Spinner ──────────────────────────────── */

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn('size-4 animate-spin text-tertiary', className)}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.2" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/* ────────────────────────────── Section ──────────────────────────────── */

export function SectionHeading({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <h2 className="text-2xs font-semibold uppercase tracking-[0.07em] text-tertiary">
        {children}
      </h2>
      {action}
    </div>
  );
}
