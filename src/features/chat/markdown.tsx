'use client';

import * as React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';

import type { Citation } from '@/server/db/schema';
import { cn } from '@/lib/utils';
import { CitationChip } from './citation';

/**
 * Markdown renderer for assistant output.
 *
 * Inline `[n]` markers are replaced with interactive citation chips bound to
 * the message's citation list, so provenance survives streaming without a
 * custom markdown syntax.
 */
export function Markdown({
  content,
  citations = [],
  className,
  compact,
}: {
  content: string;
  citations?: Citation[];
  className?: string;
  compact?: boolean;
}) {
  const decorate = React.useCallback(
    (children: React.ReactNode): React.ReactNode => {
      if (!citations.length) return children;
      return React.Children.map(children, (child) => {
        if (typeof child !== 'string') return child;
        const parts = child.split(/(\[\d{1,2}\])/g);
        if (parts.length === 1) return child;
        return parts.map((part, i) => {
          const match = part.match(/^\[(\d{1,2})\]$/);
          if (!match) return part;
          const citation = citations[Number(match[1]) - 1];
          if (!citation) return part;
          return (
            <CitationChip key={`${i}-${match[1]}`} index={Number(match[1])} citation={citation} />
          );
        });
      });
    },
    [citations],
  );

  return (
    <div className={cn('prose-app', compact && 'text-sm leading-[1.6]', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          p: ({ children }) => <p>{decorate(children)}</p>,
          li: ({ children }) => <li>{decorate(children)}</li>,
          td: ({ children }) => <td>{decorate(children)}</td>,
          a: ({ href, children }) => (
            <a href={href} target={href?.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
              {children}
            </a>
          ),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLPreElement>(null);
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    const text = ref.current?.innerText ?? '';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="group relative">
      <pre ref={ref}>{children}</pre>
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 rounded-sm border border-border bg-surface p-1 text-tertiary opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
        aria-label="Copy code"
      >
        {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
    </div>
  );
}
