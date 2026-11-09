import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

/** One connection pool for the whole server; the database holds identity and profile only — room state stays in memory. */
export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl })
  // An idle connection the database closes (a restart, a failover) makes the pool emit "error"; unhandled, that takes the whole server down.
  pool.on('error', error => console.warn('kangeikai: database connection error', error.message))
  const db = drizzle(pool, { schema })
  return { db, pool }
}

export type Db = ReturnType<typeof createDb>['db']
