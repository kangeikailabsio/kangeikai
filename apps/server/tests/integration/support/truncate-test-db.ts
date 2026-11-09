import type { Db } from '../../../src/db/client'
import { sql } from 'drizzle-orm'

/** Empties every table and restarts the id sequences, so each test starts from a clean, predictable database. */
export async function truncateAll(db: Db): Promise<void> {
  const { rows } = await db.execute<{ tablename: string }>(sql`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `)
  if (rows.length === 0)
    return

  const tables = rows.map(row => `"${row.tablename}"`).join(', ')
  await db.execute(sql.raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`))
}
