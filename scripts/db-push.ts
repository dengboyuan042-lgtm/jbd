import 'dotenv/config';

import { migrate } from '../src/server/db/migrate';
import { rawQuery } from '../src/server/db/client';

async function main() {
  console.log('▸ applying migrations…');
  await migrate();
  const tables = await rawQuery<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`,
  );
  console.log(`✓ schema ready — ${tables.length} tables`);
  console.log(tables.map((t) => `  · ${t.table_name}`).join('\n'));
  process.exit(0);
}

main().catch((error) => {
  console.error('✗ migration failed');
  console.error(error);
  process.exit(1);
});
