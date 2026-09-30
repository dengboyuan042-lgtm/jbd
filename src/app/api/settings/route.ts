import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { hashPassword, requireUser, verifyPassword } from '@/server/auth';
import { getDb } from '@/server/db/client';
import { sessions, users, type UserSettings } from '@/server/db/schema';
import { badRequest, parseBody, route } from '@/server/http';

const schema = z.object({
  name: z.string().min(1).max(80).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, 'Use at least 8 characters.').max(200).optional(),
  locale: z.string().max(12).optional(),
  settings: z
    .object({
      theme: z.enum(['light', 'dark', 'system']).optional(),
      accent: z.string().optional(),
      language: z.string().optional(),
      transcriptionLanguage: z.string().optional(),
      writingStyle: z.string().optional(),
      defaultModel: z.string().optional(),
      reduceMotion: z.boolean().optional(),
      notifications: z
        .object({
          digest: z.boolean().optional(),
          jobs: z.boolean().optional(),
          mentions: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});

export async function PATCH(request: Request) {
  return route(async () => {
    const user = await requireUser();
    const body = await parseBody(request, schema);
    const db = await getDb();

    const current = await db.query.users.findFirst({ where: eq(users.id, user.id) });
    if (!current) throw badRequest('Account not found.');

    let passwordHash: string | undefined;
    if (body.newPassword) {
      if (!body.currentPassword) {
        throw badRequest('Enter your current password to change it.');
      }
      const ok = await verifyPassword(body.currentPassword, current.passwordHash);
      if (!ok) throw badRequest('That current password is not correct.');
      passwordHash = await hashPassword(body.newPassword);
    }

    const merged: UserSettings = {
      ...((current?.settings ?? {}) as UserSettings),
      ...(body.settings ?? {}),
      notifications: {
        ...((current?.settings as UserSettings)?.notifications ?? {}),
        ...(body.settings?.notifications ?? {}),
      },
    };

    const [updated] = await db
      .update(users)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(body.locale ? { locale: body.locale } : {}),
        ...(passwordHash ? { passwordHash } : {}),
        settings: merged,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id))
      .returning();

    // Changing the password invalidates other sessions.
    if (passwordHash) {
      await db.delete(sessions).where(eq(sessions.userId, user.id));
    }

    return {
      passwordChanged: Boolean(passwordHash),
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        avatarUrl: updated.avatarUrl,
        locale: updated.locale,
        settings: updated.settings,
      },
    };
  });
}
