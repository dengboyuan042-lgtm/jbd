import { getCurrentUser } from '@/server/auth';
import { route } from '@/server/http';

export async function GET() {
  return route(async () => ({ user: await getCurrentUser() }));
}
