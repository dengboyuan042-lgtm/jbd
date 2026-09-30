import 'dotenv/config';

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

import { ids } from '../src/lib/id';
import { getDb } from '../src/server/db/client';
import { migrate } from '../src/server/db/migrate';
import { users } from '../src/server/db/schema';

/**
 * Bootstrap an account without going through the sign-up form — useful for
 * provisioning the first user on a fresh deployment.
 *
 *   npm run account:create -- you@example.com "Your Name" yourpassword
 */
async function main() {
  const [email, name, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error(
      'Usage: npm run account:create -- <email> "<name>" <password>',
    );
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  await migrate();
  const db = await getDb();
  const normalised = email.trim().toLowerCase();

  const existing = await db.query.users.findFirst({
    where: eq(users.email, normalised),
  });
  if (existing) {
    await db
      .update(users)
      .set({ passwordHash: await bcrypt.hash(password, 10), updatedAt: new Date() })
      .where(eq(users.id, existing.id));
    console.log(`✓ password updated for ${normalised}`);
    process.exit(0);
  }

  await db.insert(users).values({
    id: ids.user(),
    email: normalised,
    name: name?.trim() || normalised.split('@')[0],
    passwordHash: await bcrypt.hash(password, 10),
  });
  console.log(`✓ created account ${normalised}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
