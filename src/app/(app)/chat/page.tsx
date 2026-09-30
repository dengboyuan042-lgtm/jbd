import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ChatWorkspace } from '@/features/chat/chat-workspace';

export const metadata: Metadata = { title: 'AI' };

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatWorkspace />
    </Suspense>
  );
}
