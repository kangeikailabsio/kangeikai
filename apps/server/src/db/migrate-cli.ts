import process from 'node:process'
import { runMigrations } from './migrate'

// `pnpm db:migrate` — applies the SQL migrations in apps/server/drizzle to DATABASE_URL.
const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  console.error('DATABASE_URL is not set.')
  process.exit(1)
}

runMigrations(databaseUrl).then(() => console.warn('migrations applied')).catch((error) => {
  console.error('migration failed:', error)
  process.exit(1)
})
