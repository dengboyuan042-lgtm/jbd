import { Suspense } from 'react';

import { FlashcardReview } from '@/features/study/flashcard-review';

export default async function DeckPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <FlashcardReview deckId={id} />
    </Suspense>
  );
}
