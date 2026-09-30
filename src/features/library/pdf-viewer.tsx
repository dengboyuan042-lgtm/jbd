'use client';

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * PDFs render in the browser's own viewer through an iframe, navigated with
 * the `#page=` fragment. This keeps page-accurate citation jumps working
 * without shipping a PDF rendering engine to the client.
 */
export function PdfViewer({ url, page }: { url: string; page: number | null }) {
  const [current, setCurrent] = React.useState(page ?? 1);
  const [input, setInput] = React.useState(String(page ?? 1));
  const frameRef = React.useRef<HTMLIFrameElement>(null);

  React.useEffect(() => {
    if (page != null && page !== current) {
      setCurrent(page);
      setInput(String(page));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const src = `${url}#page=${current}&view=FitH&toolbar=1`;

  const move = (delta: number) => {
    const next = Math.max(1, current + delta);
    setCurrent(next);
    setInput(String(next));
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-sunken">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-border bg-bg px-3 py-1.5">
        <Button variant="ghost" size="icon-xs" onClick={() => move(-1)} aria-label="Previous page">
          <ChevronLeft />
        </Button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const value = Number(input);
            if (Number.isFinite(value) && value > 0) setCurrent(value);
          }}
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputSize="sm"
            className="w-14 text-center"
            aria-label="Page number"
          />
        </form>
        <Button variant="ghost" size="icon-xs" onClick={() => move(1)} aria-label="Next page">
          <ChevronRight />
        </Button>
        <span className="ml-1 text-2xs text-tertiary">Page</span>
      </div>
      <iframe
        ref={frameRef}
        key={src}
        src={src}
        title="Document"
        className="min-h-0 w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}
