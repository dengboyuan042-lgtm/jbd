'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'relative inline-flex select-none items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.985] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-fg text-inverse hover:bg-fg/90 shadow-xs',
        accent:
          'bg-accent text-white hover:bg-accent-hover shadow-xs',
        secondary:
          'border border-border bg-surface text-fg hover:bg-surface-hover hover:border-border-strong shadow-xs',
        ghost: 'text-secondary hover:bg-surface-hover hover:text-fg',
        subtle: 'bg-bg-sunken text-secondary hover:bg-surface-active hover:text-fg',
        danger:
          'border border-danger-border bg-danger-subtle text-danger hover:bg-danger hover:text-white',
        link: 'text-accent-text underline-offset-4 hover:underline',
      },
      size: {
        xs: 'h-6 rounded-sm px-2 text-2xs [&_svg]:size-3',
        sm: 'h-7 rounded-md px-2.5 text-xs [&_svg]:size-3.5',
        md: 'h-8 rounded-md px-3 text-sm [&_svg]:size-4',
        lg: 'h-9.5 rounded-lg px-4 text-base [&_svg]:size-4',
        icon: 'size-8 rounded-md [&_svg]:size-4',
        'icon-sm': 'size-7 rounded-md [&_svg]:size-3.5',
        'icon-xs': 'size-6 rounded-sm [&_svg]:size-3.5',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, block, asChild, loading, children, disabled, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, block }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="size-3.5 animate-spin" />
            <span className="contents">{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
