import type { Metadata } from 'next';
import { Suspense } from 'react';

import { SearchWorkspace } from '@/features/search/search-workspace';

export const metadata: Metadata = { title: 'Search' };

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchWorkspace />
    </Suspense>
  );
}
