import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDb } from './client'

/** Applies the SQL migrations in `apps/server/drizzle` to `DATABASE_URL`. Run with `pnpm db:migrate`. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const { db, pool } = createDb(databaseUrl)
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)) })
  }
  finally {
    await pool.end()
  }
}
