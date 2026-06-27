import { join } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

/**
 * Production migration runner — applies the drizzle-kit migration SQL.
 *
 * Dev uses `drizzle-kit migrate` (devDependency). The production image doesn't
 * ship drizzle-kit, so we apply the same migrations programmatically with
 * drizzle-orm's migrator (drizzle-orm + postgres are prod deps).
 *
 * Migration files (the drizzle-kit output incl. meta/_journal.json) are copied
 * into the image next to this file at ./migrations — see Dockerfile.
 *   node dist/db/migrate.js
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL 이 설정되지 않았습니다');
    process.exit(1);
  }
  const folder = process.env.MIGRATIONS_FOLDER ?? join(__dirname, 'migrations');
  console.log(`migrating from ${folder}`);

  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client), { migrationsFolder: folder });
    console.log('migrations applied');
  } finally {
    await client.end();
  }
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
