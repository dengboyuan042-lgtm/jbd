import { and, desc, eq, isNull, lte, or, sql } from 'drizzle-orm';

import { requireUser } from '@/server/auth';
import { getDb } from '@/server/db/client';
import {
  activities,
  chats,
  flashcards,
  notes,
  projects,
  recordings,
  sources,
  tasks,
} from '@/server/db/schema';
import { route } from '@/server/http';

/**
 * Everything the Home surface needs in one round trip, plus suggestions
 * derived from actual workspace state rather than generic prompts.
 */
export async function GET() {
  return route(async () => {
    const user = await requireUser();
    const db = await getDb();
    const owned = (table: { userId: never; deletedAt: never }) =>
      and(eq(table.userId, user.id), isNull(table.deletedAt));

    const [
      recentSources,
      recentProjects,
      recentNotes,
      recentChats,
      recentRecordings,
      recentActivity,
      openTasks,
      dueCards,
      unindexed,
    ] = await Promise.all([
      db
        .select()
        .from(sources)
        .where(owned(sources as never))
        .orderBy(desc(sources.updatedAt))
        .limit(8),
      db
        .select()
        .from(projects)
        .where(owned(projects as never))
        .orderBy(desc(projects.updatedAt))
        .limit(6),
      db
        .select()
        .from(notes)
        .where(owned(notes as never))
        .orderBy(desc(notes.updatedAt))
        .limit(6),
      db
        .select()
        .from(chats)
        .where(owned(chats as never))
        .orderBy(desc(chats.updatedAt))
        .limit(6),
      db
        .select()
        .from(recordings)
        .where(owned(recordings as never))
        .orderBy(desc(recordings.createdAt))
        .limit(5),
      db
        .select()
        .from(activities)
        .where(eq(activities.userId, user.id))
        .orderBy(desc(activities.createdAt))
        .limit(12),
      db
        .select()
        .from(tasks)
        .where(and(owned(tasks as never), sql`${tasks.status} <> 'done'`))
        .orderBy(tasks.dueAt)
        .limit(8),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(flashcards)
        .where(
          and(
            owned(flashcards as never),
            or(isNull(flashcards.dueAt), lte(flashcards.dueAt, new Date()))!,
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(sources)
        .where(and(owned(sources as never), isNull(sources.indexedAt))),
    ]);

    const suggestions: {
      id: string;
      label: string;
      detail: string;
      href: string;
      action?: string;
    }[] = [];

    const dueCount = Number(dueCards[0]?.count ?? 0);
    if (dueCount > 0) {
      suggestions.push({
        id: 'review',
        label: `Review ${dueCount} card${dueCount === 1 ? '' : 's'}`,
        detail: 'Due for spaced repetition today.',
        href: '/study',
      });
    }

    const overdue = openTasks.filter((t) => t.dueAt && t.dueAt < new Date());
    if (overdue.length) {
      suggestions.push({
        id: 'overdue',
        label: `${overdue.length} task${overdue.length === 1 ? '' : 's'} past due`,
        detail: overdue[0].title,
        href: '/tasks',
      });
    }

    const untranscribed = recentRecordings.filter((r) => r.status !== 'ready');
    if (untranscribed.length) {
      suggestions.push({
        id: 'transcribe',
        label: 'Finish a recording',
        detail: `${untranscribed[0].title} has no transcript yet.`,
        href: `/record/${untranscribed[0].id}`,
      });
    }

    const withoutSummary = recentSources.filter((s) => !s.summary);
    if (withoutSummary.length) {
      suggestions.push({
        id: 'summarise',
        label: 'Summarise new material',
        detail: withoutSummary[0].title,
        href: `/library/${withoutSummary[0].id}`,
      });
    }

    const orphaned = recentSources.filter((s) => !s.projectId);
    if (orphaned.length >= 3 && recentProjects.length) {
      suggestions.push({
        id: 'organise',
        label: 'Organise loose material',
        detail: `${orphaned.length} sources are not in a project.`,
        href: '/library',
      });
    }

    return {
      sources: recentSources,
      projects: recentProjects,
      notes: recentNotes,
      chats: recentChats,
      recordings: recentRecordings,
      activity: recentActivity,
      tasks: openTasks,
      stats: {
        dueCards: dueCount,
        unindexed: Number(unindexed[0]?.count ?? 0),
        openTasks: openTasks.length,
      },
      suggestions: suggestions.slice(0, 4),
    };
  });
}
