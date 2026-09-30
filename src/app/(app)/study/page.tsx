import type { Metadata } from 'next';
import { Suspense } from 'react';

import { StudyHome } from '@/features/study/study-home';

export const metadata: Metadata = { title: 'Study' };

export default function StudyPage() {
  return (
    <Suspense fallback={null}>
      <StudyHome />
    </Suspense>
  );
}
