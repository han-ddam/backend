import { defineConfig } from 'drizzle-kit';

// DATABASE_URL is read from the environment (see env.example).
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://handdam:handdam@localhost:5432/handdam',
  },
  // Spatial DDL (CREATE EXTENSION, GIST/GIN indexes, generated tsvector columns,
  // partial unique indexes) is hand-authored in src/db/migrations — drizzle-kit
  // cannot infer it. Review every generated migration before applying.
  verbose: true,
  strict: true,
});
