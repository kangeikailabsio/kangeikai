import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { Server as HttpServer } from 'node:http'
import type { AuthConfig } from '../../src/auth/auth-config'
import express from 'express'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createAuth } from '../../src/auth/auth'
import { createDb } from '../../src/db/client'
import { DEV_USER_PASSWORD, DEV_USERS, seedDevUsers } from '../../src/db/seed-users'
import { registerAuthRoutes } from '../../src/http/auth-route'
import { createTestDb } from './support/create-test-db'
import { truncateAll } from './support/truncate-test-db'

const CLIENT_ORIGIN = 'http://localhost:5173'
const EVIL_ORIGIN = 'https://evil.example.com'
const email = 'ana@example.com'
const password = 'correct horse battery'

// Runs against a PostgreSQL container started here (needs Docker); every test starts from empty tables.
describe('auth routes against postgres (issue #231)', () => {
  let container: StartedPostgreSqlContainer
  let server: HttpServer
  let baseUrl: string
  let pool: ReturnType<typeof createDb>['pool']
  let db: ReturnType<typeof createDb>['db']
  let auth: ReturnType<typeof createAuth>

  beforeAll(async () => {
    container = await createTestDb()
    const config: AuthConfig = {
      databaseUrl: container.getConnectionUri(),
      secret: 'integration-test-secret-at-least-32-chars',
      baseUrl: 'http://localhost',
      clientOrigins: [CLIENT_ORIGIN],
      cookieDomain: undefined,
      google: { clientId: 'id', clientSecret: 'secret' },
    }
    const created = createDb(config.databaseUrl)
    pool = created.pool
    db = created.db
    auth = createAuth(config, db)

    const app = express()
    // Stands in for Colyseus, which sets these on every response before Express runs.
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*')
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      next()
    })
    registerAuthRoutes(app, auth, config)
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve())
    })
    const address = server.address()
    baseUrl = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`
  }, 60_000)

  afterEach(async () => {
    await truncateAll(db)
  })

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await pool.end()
    await container.stop()
  })

  function post(path: string, body: object, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}/api/auth${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': CLIENT_ORIGIN, ...headers },
      body: JSON.stringify(body),
    })
  }

  const signUpAna = () => post('/sign-up/email', { name: 'Ana', email, password })

  it('signs up with email and password and sets a session cookie', async () => {
    const response = await signUpAna()

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('better-auth.session_token')
    const body = await response.json() as { user: { email: string, name: string, spriteType: string } }
    expect(body.user).toMatchObject({ email, name: 'Ana', spriteType: 'man' })
  })

  it('gives users integer ids that start at 1 and increment', async () => {
    const first = await post('/sign-up/email', { name: 'One', email: 'one@example.com', password })
    const second = await post('/sign-up/email', { name: 'Two', email: 'two@example.com', password })

    expect(((await first.json()) as { user: { id: string } }).user.id).toBe('1')
    expect(((await second.json()) as { user: { id: string } }).user.id).toBe('2')
  })

  it('rejects a second sign up with the same email', async () => {
    await signUpAna()

    const response = await signUpAna()

    expect(response.status).toBe(422)
  })

  it('rejects a password shorter than the minimum', async () => {
    const response = await post('/sign-up/email', { name: 'Short', email: 'short@example.com', password: 'short' })

    expect(response.status).toBe(400)
  })

  it('signs in, and the cookie it sets identifies the session', async () => {
    await signUpAna()

    const signIn = await post('/sign-in/email', { email, password })
    expect(signIn.status).toBe(200)
    const cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0]
    const session = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { Cookie: cookie, Origin: CLIENT_ORIGIN } })

    const body = await session.json() as { user: { email: string } }
    expect(body.user.email).toBe(email)
  })

  it('rejects a wrong password without saying which part was wrong', async () => {
    await signUpAna()

    const response = await post('/sign-in/email', { email, password: 'wrong password!' })

    expect(response.status).toBe(401)
    const body = await response.json() as { code: string }
    expect(body.code).toBe('INVALID_EMAIL_OR_PASSWORD')
  })

  it('rejects a sign up that tries to write the avatar fields', async () => {
    const response = await post('/sign-up/email', {
      name: 'Eve',
      email: 'eve@example.com',
      password,
      spriteType: 'woman',
      characterSelection: '{"body":9}',
    })

    expect(response.status).toBe(400)
  })

  it('answers a preflight from the configured client origin with credentials allowed', async () => {
    const response = await fetch(`${baseUrl}/api/auth/sign-in/email`, {
      method: 'OPTIONS',
      headers: { 'Origin': CLIENT_ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
    })

    expect(response.headers.get('access-control-allow-origin')).toBe(CLIENT_ORIGIN)
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
  })

  // better-auth skips its own origin check when NODE_ENV=test, so the 403 for an untrusted origin is
  // only observable on the running server; what is ours to assert here is the CORS header.
  it('grants no CORS to another origin, even when the layer in front echoes it', async () => {
    const response = await post('/sign-in/email', { email, password }, { Origin: EVIL_ORIGIN })

    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
  })

  it('seeds the dev users once, and they can sign in with the shared password', async () => {
    const first = await seedDevUsers(auth, db)
    const second = await seedDevUsers(auth, db)

    expect(first).toEqual(DEV_USERS.map(dev => dev.email))
    expect(second).toEqual([])
    for (const dev of DEV_USERS) {
      const response = await post('/sign-in/email', { email: dev.email, password: DEV_USER_PASSWORD })
      expect(response.status).toBe(200)
      const body = await response.json() as { user: { spriteType: string } }
      expect(body.user.spriteType).toBe(dev.spriteType)
    }
  })
})
