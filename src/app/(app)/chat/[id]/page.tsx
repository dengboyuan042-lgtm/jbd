import { Suspense } from 'react';

import { ChatWorkspace } from '@/features/chat/chat-workspace';

export default async function ChatDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ChatWorkspace chatId={id} />
    </Suspense>
  );
}
