import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@db/schema';

/** Injection token for the Drizzle database handle. */
export const DRIZZLE = Symbol('DRIZZLE');

/** The typed Drizzle database, aware of the full schema. */
export type DrizzleDB = PostgresJsDatabase<typeof schema>;
