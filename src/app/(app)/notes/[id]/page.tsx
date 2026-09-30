import { Suspense } from 'react';

import { NotesWorkspace } from '@/features/notes/notes-workspace';

export default async function NoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <NotesWorkspace noteId={id} />
    </Suspense>
  );
}
