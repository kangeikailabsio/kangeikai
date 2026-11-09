import process from 'node:process'

/**
 * Ports and database the end-to-end suite uses (issue #227). They differ from the development
 * defaults (2567 and 5173) so the suite never collides with a running `pnpm dev:server` /
 * `dev:client`, and it gets its own database, recreated on every run.
 */
export const SERVER_PORT = 2667
export const CLIENT_PORT = 5273
export const SERVER_URL = `http://localhost:${SERVER_PORT}`
export const CLIENT_URL = `http://localhost:${CLIENT_PORT}`

export const E2E_DATABASE_NAME = 'kangeikai_e2e'

/** A connection to the maintenance database of the compose PostgreSQL (`pnpm dev:infra`); override with `E2E_POSTGRES_URL`. */
export const ADMIN_DATABASE_URL = process.env.E2E_POSTGRES_URL ?? 'postgres://kangeikai:kangeikai@localhost:5432/postgres'

export function e2eDatabaseUrl(): string {
  const url = new URL(ADMIN_DATABASE_URL)
  url.pathname = `/${E2E_DATABASE_NAME}`
  return url.toString()
}
