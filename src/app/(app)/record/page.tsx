import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RecordWorkspace } from '@/features/voice/record-workspace';

export const metadata: Metadata = { title: 'Record' };

export default function RecordPage() {
  return (
    <Suspense fallback={null}>
      <RecordWorkspace />
    </Suspense>
  );
}
