import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ToolsWorkspace } from '@/features/tools/tools-workspace';

export const metadata: Metadata = { title: 'Tools' };

export default function ToolsPage() {
  return (
    <Suspense fallback={null}>
      <ToolsWorkspace />
    </Suspense>
  );
}
