// Recreates the end-to-end database and applies the migrations to it. Runs right before the test
// server starts (see playwright.config.ts), so the server always begins on empty tables.
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import pg from 'pg'

const { ADMIN_DATABASE_URL, E2E_DATABASE_NAME, DATABASE_URL } = process.env

async function recreateDatabase() {
  const admin = new pg.Client({ connectionString: ADMIN_DATABASE_URL })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${E2E_DATABASE_NAME}" WITH (FORCE)`)
    await admin.query(`CREATE DATABASE "${E2E_DATABASE_NAME}"`)
  }
  finally {
    await admin.end()
  }
}

recreateDatabase().then(() => {
  const migrate = spawnSync('pnpm', ['--filter', '@kangeikai/server', 'db:migrate'], { stdio: 'inherit', env: { ...process.env, DATABASE_URL } })
  process.exit(migrate.status ?? 1)
}).catch((error) => {
  console.error('could not prepare the e2e database:', error)
  process.exit(1)
})
