import { Suspense } from 'react';

import { MindMapView } from '@/features/study/mind-map-view';

export default async function MindMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <MindMapView mapId={id} />
    </Suspense>
  );
}
