'use client';

import * as React from 'react';
import { CircleCheck, CircleX, FileUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn, formatBytes } from '@/lib/utils';

type Outcome = {
  name: string;
  status: 'pending' | 'done' | 'error';
  detail?: string;
};

export function UploadDialog({
  open,
  onOpenChange,
  projectId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string | null;
  onDone?: () => void;
}) {
  const [files, setFiles] = React.useState<File[]>([]);
  const [outcomes, setOutcomes] = React.useState<Outcome[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!open) {
      setFiles([]);
      setOutcomes([]);
      setBusy(false);
    }
  }, [open]);

  const upload = async () => {
    if (!files.length) return;
    setBusy(true);
    setOutcomes(files.map((f) => ({ name: f.name, status: 'pending' })));

    const form = new FormData();
    files.forEach((file) => form.append('files', file));
    if (projectId) form.append('projectId', projectId);

    try {
      const data = await api.upload<{
        results: { title: string; chunks: number; warning?: string }[];
        errors: { name: string; error: string }[];
      }>('/api/files/upload', form);

      setOutcomes([
        ...data.results.map((r) => ({
          name: r.title,
          status: 'done' as const,
          detail: r.warning ?? `${r.chunks} passages indexed`,
        })),
        ...data.errors.map((e) => ({
          name: e.name,
          status: 'error' as const,
          detail: e.error,
        })),
      ]);

      if (data.results.length) {
        toast.success(
          `Added ${data.results.length} item${data.results.length === 1 ? '' : 's'} to your library`,
        );
        onDone?.();
      }
      if (!data.errors.length) {
        setTimeout(() => onOpenChange(false), 700);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed.');
      setOutcomes(files.map((f) => ({ name: f.name, status: 'error' })));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Add to library</DialogTitle>
          <DialogDescription>
            PDF, Word, PowerPoint, spreadsheets, Markdown, text, images, audio and video.
            Documents are parsed and indexed so answers can cite exact pages.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              setFiles((prev) => [...prev, ...Array.from(e.dataTransfer.files)]);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center transition-colors',
              dragging
                ? 'border-accent bg-accent-subtle'
                : 'border-border hover:border-border-strong hover:bg-surface-hover',
            )}
          >
            <FileUp className="size-5 text-tertiary" />
            <p className="text-sm text-fg">Drop files here, or click to browse</p>
            <p className="text-xs text-tertiary">Up to 100 MB per file</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={(e) =>
                e.target.files && setFiles((prev) => [...prev, ...Array.from(e.target.files!)])
              }
            />
          </div>

          {files.length && !outcomes.length ? (
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto scrollbar-thin">
              {files.map((file, i) => (
                <li
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-2 rounded-md bg-bg-sunken px-2.5 py-1.5 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate text-fg">{file.name}</span>
                  <span className="shrink-0 text-tertiary">{formatBytes(file.size)}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFiles((prev) => prev.filter((_, index) => index !== i));
                    }}
                    className="shrink-0 text-tertiary hover:text-danger"
                  >
                    <CircleX className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {outcomes.length ? (
            <ul className="mt-3 max-h-48 space-y-1 overflow-y-auto scrollbar-thin">
              {outcomes.map((outcome, i) => (
                <li
                  key={`${outcome.name}-${i}`}
                  className="flex items-start gap-2 rounded-md bg-bg-sunken px-2.5 py-1.5 text-xs"
                >
                  {outcome.status === 'pending' ? (
                    <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-tertiary" />
                  ) : outcome.status === 'done' ? (
                    <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
                  ) : (
                    <CircleX className="mt-0.5 size-3.5 shrink-0 text-danger" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-fg">{outcome.name}</span>
                    {outcome.detail ? (
                      <span className="block text-2xs text-tertiary">{outcome.detail}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="primary" onClick={upload} loading={busy} disabled={!files.length}>
            Add {files.length ? `${files.length} file${files.length === 1 ? '' : 's'}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
