import type { AuthConfig } from '../../src/auth/auth-config'
import { describe, expect, it } from 'vitest'
import { buildAuthOptions } from '../../src/auth/auth-options'

const config: AuthConfig = {
  databaseUrl: 'postgres://localhost/kangeikai',
  secret: 'x'.repeat(32),
  baseUrl: 'http://localhost:2567',
  clientOrigins: ['http://localhost:5173'],
  cookieDomain: undefined,
  google: { clientId: 'client-id', clientSecret: 'client-secret' },
}

describe('buildAuthOptions (issue #282)', () => {
  it('passes the config through and uses serial ids', () => {
    const options = buildAuthOptions(config)

    expect(options).toMatchObject({
      baseURL: config.baseUrl,
      secret: config.secret,
      trustedOrigins: config.clientOrigins,
      socialProviders: { google: { clientId: 'client-id', clientSecret: 'client-secret' } },
      advanced: { database: { generateId: 'serial' } },
    })
  })

  it('keeps the cookies on the API host unless a cookie domain is set', () => {
    expect(buildAuthOptions(config).advanced?.crossSubDomainCookies).toBeUndefined()
  })

  it('shares the cookies across subdomains when a cookie domain is set', () => {
    expect(buildAuthOptions({ ...config, cookieDomain: 'example.com' }).advanced?.crossSubDomainCookies).toEqual({ enabled: true, domain: 'example.com' })
  })

  it('does not let clients write the avatar fields', () => {
    const fields = buildAuthOptions(config).user?.additionalFields

    expect(fields?.characterSelection).toMatchObject({ input: false })
    expect(fields?.spriteType).toMatchObject({ input: false })
  })
})
