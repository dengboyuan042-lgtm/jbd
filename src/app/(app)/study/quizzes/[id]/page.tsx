import { Suspense } from 'react';

import { QuizRunner } from '@/features/study/quiz-runner';

export default async function QuizPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <QuizRunner quizId={id} />
    </Suspense>
  );
}
