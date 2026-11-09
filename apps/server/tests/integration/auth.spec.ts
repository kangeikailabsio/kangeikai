import type { Server as HttpServer } from 'node:http'
import type { AuthConfig } from '../../src/auth/auth-config'
import process from 'node:process'
import express from 'express'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAuth } from '../../src/auth/auth'
import { createDb } from '../../src/db/client'
import { runMigrations } from '../../src/db/migrate'
import { DEV_USER_PASSWORD, DEV_USERS, seedDevUsers } from '../../src/db/seed-users'
import { registerAuthRoutes } from '../../src/http/auth-route'

// Needs a real PostgreSQL (docker compose -f docker-compose.dev.yml up postgres); skipped without one.
const databaseUrl = process.env.DATABASE_URL
const CLIENT_ORIGIN = 'http://localhost:5173'

describe.skipIf(!databaseUrl)('auth routes against postgres (issue #231)', () => {
  let server: HttpServer
  let baseUrl: string
  let pool: ReturnType<typeof createDb>['pool']
  let seedAuth: ReturnType<typeof createAuth>
  let seedDb: ReturnType<typeof createDb>['db']
  const run = Date.now()

  beforeAll(async () => {
    await runMigrations(databaseUrl!)
    const config: AuthConfig = {
      databaseUrl: databaseUrl!,
      secret: 'integration-test-secret-at-least-32-chars',
      baseUrl: 'http://localhost',
      clientOrigins: [CLIENT_ORIGIN],
      cookieDomain: undefined,
      google: { clientId: 'id', clientSecret: 'secret' },
    }
    const created = createDb(databaseUrl!)
    pool = created.pool
    const app = express()
    // Stands in for Colyseus, which sets these on every response before Express runs.
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*')
      res.setHeader('Access-Control-Allow-Credentials', 'true')
      next()
    })
    seedDb = created.db
    seedAuth = createAuth(config, created.db)
    registerAuthRoutes(app, seedAuth, config)
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve())
    })
    const address = server.address()
    baseUrl = `http://localhost:${typeof address === 'object' && address ? address.port : 0}`
  })

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await pool.end()
  })

  function post(path: string, body: object, headers: Record<string, string> = {}) {
    return fetch(`${baseUrl}/api/auth${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': CLIENT_ORIGIN, ...headers },
      body: JSON.stringify(body),
    })
  }

  const email = `ana-${run}@example.com`
  const password = 'correct horse battery'

  it('signs up with email and password and sets a session cookie', async () => {
    const response = await post('/sign-up/email', { name: 'Ana', email, password })

    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('better-auth.session_token')
    const body = await response.json() as { user: { email: string, name: string, spriteType: string } }
    expect(body.user).toMatchObject({ email, name: 'Ana', spriteType: 'man' })
  })

  it('gives users integer, incrementing ids', async () => {
    const first = await post('/sign-up/email', { name: 'One', email: `one-${run}@example.com`, password })
    const second = await post('/sign-up/email', { name: 'Two', email: `two-${run}@example.com`, password })

    const firstId = ((await first.json()) as { user: { id: string } }).user.id
    const secondId = ((await second.json()) as { user: { id: string } }).user.id
    expect(firstId).toMatch(/^\d+$/)
    expect(secondId).toMatch(/^\d+$/)
    expect(Number(secondId)).toBe(Number(firstId) + 1)
  })

  it('rejects a second sign up with the same email', async () => {
    const response = await post('/sign-up/email', { name: 'Ana again', email, password })

    expect(response.status).toBe(422)
  })

  it('rejects a password shorter than the minimum', async () => {
    const response = await post('/sign-up/email', { name: 'Short', email: `short-${run}@example.com`, password: 'short' })

    expect(response.status).toBe(400)
  })

  it('signs in, and the cookie it sets identifies the session', async () => {
    const signIn = await post('/sign-in/email', { email, password })
    expect(signIn.status).toBe(200)
    const cookie = (signIn.headers.get('set-cookie') ?? '').split(';')[0]

    const session = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { Cookie: cookie, Origin: CLIENT_ORIGIN } })

    const body = await session.json() as { user: { email: string } }
    expect(body.user.email).toBe(email)
  })

  it('rejects a wrong password without saying which part was wrong', async () => {
    const response = await post('/sign-in/email', { email, password: 'wrong password!' })

    expect(response.status).toBe(401)
    const body = await response.json() as { code: string }
    expect(body.code).toBe('INVALID_EMAIL_OR_PASSWORD')
  })

  it('rejects a sign up that tries to write the avatar fields', async () => {
    const response = await post('/sign-up/email', {
      name: 'Eve',
      email: `eve-${run}@example.com`,
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
    const response = await post('/sign-in/email', { email, password }, { Origin: 'https://evil.example.com' })

    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
  })

  it('seeds the dev users once, and they can sign in with the shared password', async () => {
    await seedDevUsers(seedAuth, seedDb)
    const second = await seedDevUsers(seedAuth, seedDb)

    expect(second).toEqual([])
    for (const dev of DEV_USERS) {
      const response = await post('/sign-in/email', { email: dev.email, password: DEV_USER_PASSWORD })
      expect(response.status).toBe(200)
      const body = await response.json() as { user: { spriteType: string } }
      expect(body.user.spriteType).toBe(dev.spriteType)
    }
  })
})
