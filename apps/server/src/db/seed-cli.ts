import process from 'node:process'
import { createAuth } from '../auth/auth'
import { loadAuthConfig } from '../auth/auth-config'
import { createDb } from './client'
import { DEV_USER_PASSWORD, DEV_USERS, isLocalDatabaseUrl, seedDevUsers } from './seed-users'

// `pnpm db:seed` — creates the local dev accounts (see seed-users.ts). Safe to re-run.
async function main(): Promise<void> {
  const config = loadAuthConfig(process.env)
  if (!isLocalDatabaseUrl(config.databaseUrl)) {
    console.error('Refusing to seed: DATABASE_URL is not a local database.')
    process.exit(1)
  }

  const { db, pool } = createDb(config.databaseUrl)
  try {
    const created = await seedDevUsers(createAuth(config, db), db)
    console.warn(created.length ? `seeded: ${created.join(', ')}` : 'dev users already exist')
    console.warn(`sign in with ${DEV_USERS.map(dev => dev.email).join(' or ')} / ${DEV_USER_PASSWORD}`)
  }
  finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error('seed failed:', error)
  process.exit(1)
})
