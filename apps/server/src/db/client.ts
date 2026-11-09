import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

/** One connection pool for the whole server; the database holds identity and profile only — room state stays in memory. */
export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl })
  const db = drizzle(pool, { schema })
  return { db, pool }
}

export type Db = ReturnType<typeof createDb>['db']
