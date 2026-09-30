import type { Metadata } from 'next';
import { Suspense } from 'react';

import { NotesWorkspace } from '@/features/notes/notes-workspace';

export const metadata: Metadata = { title: 'Notes' };

export default function NotesPage() {
  return (
    <Suspense fallback={null}>
      <NotesWorkspace />
    </Suspense>
  );
}
