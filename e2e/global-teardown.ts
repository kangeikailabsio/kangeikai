import { Client } from 'pg'
import { ADMIN_DATABASE_URL, E2E_DATABASE_NAME } from './support/env'

/** Drops the end-to-end database once the run is over. */
export default async function globalTeardown(): Promise<void> {
  const admin = new Client({ connectionString: ADMIN_DATABASE_URL })
  await admin.connect()
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${E2E_DATABASE_NAME}" WITH (FORCE)`)
  }
  finally {
    await admin.end()
  }
}
