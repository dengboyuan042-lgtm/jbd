import { Suspense } from 'react';

import { ProjectWorkspace } from '@/features/projects/project-workspace';

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ProjectWorkspace projectId={id} />
    </Suspense>
  );
}
