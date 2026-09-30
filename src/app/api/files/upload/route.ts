import { requireUser } from '@/server/auth';
import { badRequest, route } from '@/server/http';
import { ingestFile } from '@/services/knowledge/ingest';

const MAX_BYTES = 100 * 1024 * 1024;

export async function POST(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const form = await request.formData();
    const projectId = (form.get('projectId') as string) || null;

    const entries = form.getAll('files').filter((f): f is File => f instanceof File);
    if (!entries.length) throw badRequest('No files were included in the upload.');

    const results = [];
    const errors: { name: string; error: string }[] = [];

    for (const file of entries) {
      if (file.size > MAX_BYTES) {
        errors.push({ name: file.name, error: 'File exceeds the 100 MB limit.' });
        continue;
      }
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        results.push(
          await ingestFile({
            userId: user.id,
            projectId,
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            buffer,
          }),
        );
      } catch (error) {
        errors.push({
          name: file.name,
          error: error instanceof Error ? error.message : 'Upload failed.',
        });
      }
    }

    return { results, errors };
  });
}

export const runtime = 'nodejs';
export const maxDuration = 300;
