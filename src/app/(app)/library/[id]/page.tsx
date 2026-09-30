import { Suspense } from 'react';

import { SourceReader } from '@/features/library/source-reader';

export default async function SourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <SourceReader sourceId={id} />
    </Suspense>
  );
}
