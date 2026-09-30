'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Link2 } from 'lucide-react';
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
import { Field, Input } from '@/components/ui/input';
import { api } from '@/lib/api';

export function ImportDialog({
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
  const router = useRouter();
  const [url, setUrl] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setUrl('');
      setError(null);
    }
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ sourceId: string; title: string; chunks: number }>(
        '/api/import/url',
        { url: url.trim(), projectId: projectId ?? null },
      );
      toast.success(`Imported “${result.title}”`, {
        description: `${result.chunks} passages indexed`,
        action: {
          label: 'Open',
          onClick: () => router.push(`/library/${result.sourceId}`),
        },
      });
      onDone?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Import from a link</DialogTitle>
            <DialogDescription>
              Articles and documentation pages are extracted as readable text. YouTube links
              are imported with their captions, so answers can cite timestamps.
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <Field label="URL" error={error}>
              <div className="flex items-center gap-2">
                <Link2 className="size-3.5 shrink-0 text-tertiary" />
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  autoFocus
                  inputSize="md"
                />
              </div>
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={busy} disabled={!url.trim()}>
              Import
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
