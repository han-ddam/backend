import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import { v7 as uuidv7 } from 'uuid';
import * as schema from '../src/db/schema';

/**
 * Bootstrap the first SUPER_ADMIN.
 *   pnpm seed:admin <email> <password> <name>
 * Further admins are created by a SUPER_ADMIN via POST /api/admin/admins.
 */
async function main() {
  const [, , email, password, name] = process.argv;
  if (!email || !password || !name) {
    console.error('Usage: pnpm seed:admin <email> <password> <name>');
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set (check your .env)');
    process.exit(1);
  }

  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });
  try {
    const existing = await db
      .select()
      .from(schema.admins)
      .where(eq(schema.admins.email, email));
    if (existing.length > 0) {
      console.error(`Admin already exists: ${email}`);
      process.exit(1);
    }
    await db.insert(schema.admins).values({
      id: uuidv7(),
      email,
      passwordHash: await hash(password),
      name,
      role: 'SUPER_ADMIN',
    });
    console.log(`Created SUPER_ADMIN: ${email}`);
  } finally {
    await client.end();
  }
}

void main();
