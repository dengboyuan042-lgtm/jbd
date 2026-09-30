'use client';

import * as React from 'react';

import { Page, PageBody, PageHeader } from '@/components/shell/page';
import { Skeleton } from '@/components/ui/primitives';
import { useApi } from '@/hooks/use-api';
import { usePanel } from '@/features/workspace/workspace-context';
import { TaskList, type TaskRow } from './task-list';

export function TasksPageClient() {
  const { data, loading, refresh } = useApi<{ tasks: TaskRow[] }>('/api/tasks');
  usePanel({ mode: 'chat', title: 'Assistant' }, []);

  const open = data?.tasks.filter((t) => t.status !== 'done').length ?? 0;

  return (
    <Page>
      <PageHeader
        title="Tasks"
        subtitle={
          open
            ? `${open} open · extracted from your material or added by hand`
            : 'Action items from meetings and documents collect here.'
        }
      />
      <PageBody width="narrow">
        {loading ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : (
          <TaskList tasks={data?.tasks ?? []} onChange={refresh} />
        )}
      </PageBody>
    </Page>
  );
}
