import { describe, expect, it } from 'vitest'
import { isAllowedOrigin, loadAuthConfig } from '../../src/auth/auth-config'

const validEnv = {
  DATABASE_URL: 'postgres://kangeikai:kangeikai@localhost:5432/kangeikai',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
  BETTER_AUTH_URL: 'http://localhost:2567',
  CLIENT_ORIGIN: 'http://localhost:5173',
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
}

describe('loadAuthConfig (issue #231)', () => {
  it('reads a valid environment', () => {
    expect(loadAuthConfig(validEnv)).toEqual({
      databaseUrl: validEnv.DATABASE_URL,
      secret: validEnv.BETTER_AUTH_SECRET,
      baseUrl: 'http://localhost:2567',
      clientOrigins: ['http://localhost:5173'],
      cookieDomain: undefined,
      google: { clientId: 'client-id', clientSecret: 'client-secret' },
    })
  })

  it('lists every missing variable at once, by name', () => {
    expect(() => loadAuthConfig({})).toThrow(/DATABASE_URL is required[\s\S]*BETTER_AUTH_SECRET is required[\s\S]*CLIENT_ORIGIN is required[\s\S]*GOOGLE_CLIENT_ID is required[\s\S]*GOOGLE_CLIENT_SECRET is required/)
  })

  it('rejects a short signing secret', () => {
    expect(() => loadAuthConfig({ ...validEnv, BETTER_AUTH_SECRET: 'x'.repeat(31) })).toThrow('at least 32 characters')
    expect(loadAuthConfig({ ...validEnv, BETTER_AUTH_SECRET: 'x'.repeat(32) }).secret).toHaveLength(32)
  })

  it('rejects a database url that is not postgres and a base url that is not http(s)', () => {
    expect(() => loadAuthConfig({ ...validEnv, DATABASE_URL: 'mysql://x' })).toThrow('postgres:// URL')
    expect(() => loadAuthConfig({ ...validEnv, BETTER_AUTH_URL: 'localhost:2567' })).toThrow('BETTER_AUTH_URL must be an http(s) URL')
  })

  it('reduces BETTER_AUTH_URL to its origin', () => {
    expect(loadAuthConfig({ ...validEnv, BETTER_AUTH_URL: 'https://api.example.com/' }).baseUrl).toBe('https://api.example.com')
  })

  it('normalises a comma-separated list of client origins (trim, no path, no trailing slash, no duplicates)', () => {
    const config = loadAuthConfig({ ...validEnv, CLIENT_ORIGIN: ' https://app.example.com/ , http://localhost:5173,https://app.example.com/room' })

    expect(config.clientOrigins).toEqual(['https://app.example.com', 'http://localhost:5173'])
  })

  it('rejects an invalid client origin', () => {
    expect(() => loadAuthConfig({ ...validEnv, CLIENT_ORIGIN: 'http://localhost:5173,not a url' })).toThrow('invalid origin')
  })

  it('treats an empty cookie domain as unset', () => {
    expect(loadAuthConfig({ ...validEnv, COOKIE_DOMAIN: '  ' }).cookieDomain).toBeUndefined()
    expect(loadAuthConfig({ ...validEnv, COOKIE_DOMAIN: 'app.example.com' }).cookieDomain).toBe('app.example.com')
  })
})

describe('isAllowedOrigin (issue #231)', () => {
  const config = { clientOrigins: ['https://app.example.com'] }

  it('allows the configured client origin', () => {
    expect(isAllowedOrigin('https://app.example.com', config)).toBe(true)
  })

  it('rejects any other origin, including a lookalike and the same host over http', () => {
    expect(isAllowedOrigin('https://evil.example.com', config)).toBe(false)
    expect(isAllowedOrigin('https://app.example.com.evil.com', config)).toBe(false)
    expect(isAllowedOrigin('http://app.example.com', config)).toBe(false)
  })

  it('allows requests that send no Origin header (same-origin and non-browser callers)', () => {
    expect(isAllowedOrigin(undefined, config)).toBe(true)
  })
})
