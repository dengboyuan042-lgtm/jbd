import { endSession } from '@/server/auth';
import { route } from '@/server/http';

export async function POST() {
  return route(async () => {
    await endSession();
    return { ok: true };
  });
}
