import { Suspense } from 'react';

import { RecordingDetail } from '@/features/voice/recording-detail';

export default async function RecordingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <RecordingDetail recordingId={id} />
    </Suspense>
  );
}
