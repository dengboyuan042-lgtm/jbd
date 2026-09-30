import { z } from 'zod';

import { env } from '@/lib/env';
import { createUser, startSession } from '@/server/auth';
import { HttpError, parseBody, route } from '@/server/http';

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(80),
  password: z.string().min(8, 'Use at least 8 characters.').max(200),
});

export async function POST(request: Request) {
  return route(async () => {
    if (!env().ALLOW_SIGNUP) {
      throw new HttpError(
        403,
        'Sign-up is closed on this instance. Ask the owner to provision an account for you.',
      );
    }
    const body = await parseBody(request, schema);
    const user = await createUser(body);
    await startSession(user.id, request.headers.get('user-agent') ?? undefined);
    return { user };
  });
}
