import type { Metadata } from 'next';
import { Suspense } from 'react';

import { LibraryBrowser } from '@/features/library/library-browser';

export const metadata: Metadata = { title: 'Library' };

export default function LibraryPage() {
  return (
    <Suspense fallback={null}>
      <LibraryBrowser />
    </Suspense>
  );
}
