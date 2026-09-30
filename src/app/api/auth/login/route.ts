import { z } from 'zod';

import { authenticate, startSession } from '@/server/auth';
import { parseBody, route } from '@/server/http';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  return route(async () => {
    const { email, password } = await parseBody(request, schema);
    const user = await authenticate(email, password);
    await startSession(user.id, request.headers.get('user-agent') ?? undefined);
    return { user };
  });
}
