'use client';

import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import * as Tooltip from '@radix-ui/react-tooltip';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <Tooltip.Provider delayDuration={400} skipDelayDuration={300}>
        {children}
        <Toaster
          position="bottom-right"
          gap={8}
          offset={16}
          toastOptions={{
            unstyled: true,
            classNames: {
              toast:
                'flex w-full items-start gap-2.5 rounded-lg border border-border bg-overlay px-3.5 py-3 text-sm text-fg shadow-lg',
              title: 'font-medium',
              description: 'text-secondary text-xs mt-0.5',
              actionButton:
                'ml-auto rounded-sm bg-fg px-2 py-1 text-xs text-inverse',
            },
          }}
        />
      </Tooltip.Provider>
    </ThemeProvider>
  );
}
