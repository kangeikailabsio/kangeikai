import type { BetterAuthOptions } from 'better-auth'
import type { AuthConfig } from './auth-config'

/**
 * Everything about better-auth's behaviour except the database. Shared by the runtime instance
 * (`auth.ts`) and `auth-cli.ts`, which `db:generate-auth-schema` reads to derive the Drizzle schema —
 * one definition, so the tables can never drift from what the server actually runs.
 */
export function buildAuthOptions(config: AuthConfig): Omit<BetterAuthOptions, 'database'> {
  return {
    baseURL: config.baseUrl,
    secret: config.secret,
    trustedOrigins: config.clientOrigins,
    emailAndPassword: {
      enabled: true,
      // The web form (apps/client auth-form.ts) enforces the same bounds.
      minPasswordLength: 8,
      maxPasswordLength: 128,
      // No SMTP in the MVP: no verification, no password reset (docs/deferred-scope.md).
      requireEmailVerification: false,
    },
    socialProviders: {
      google: { clientId: config.google.clientId, clientSecret: config.google.clientSecret },
    },
    user: {
      additionalFields: {
        // The account's avatar. `input: false` keeps clients from writing them through the generic
        // endpoints; the profile endpoint that validates them comes with the integration (#232).
        spriteType: { type: 'string', required: false, defaultValue: 'man', input: false },
        characterSelection: { type: 'string', required: false, input: false },
      },
    },
    advanced: {
      // Integer, auto-incrementing ids instead of random strings (the schema uses identity columns).
      database: { generateId: 'serial' },
      ...(config.cookieDomain
        ? { crossSubDomainCookies: { enabled: true, domain: config.cookieDomain } }
        : {}),
    },
  }
}
