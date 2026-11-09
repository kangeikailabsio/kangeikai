// Input for `pnpm db:generate-auth-schema` only (never imported by the server): the better-auth
// CLI needs an `auth` export to derive the tables from. The adapter's database is irrelevant for
// schema generation, so a stub stands in.
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { buildAuthOptions } from './auth-options'

export const auth = betterAuth({
  ...buildAuthOptions({
    databaseUrl: 'postgres://stub',
    secret: 'schema-generation-only-secret-not-used-at-runtime',
    baseUrl: 'http://localhost:2567',
    clientOrigins: [],
    cookieDomain: undefined,
    google: { clientId: 'stub', clientSecret: 'stub' },
  }),
  database: drizzleAdapter({}, { provider: 'pg' }),
})
