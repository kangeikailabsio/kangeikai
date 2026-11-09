import type { Db } from '../db/client'
import type { AuthConfig } from './auth-config'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import * as schema from '../db/schema'
import { buildAuthOptions } from './auth-options'

export function createAuth(config: AuthConfig, db: Db) {
  return betterAuth({
    ...buildAuthOptions(config),
    database: drizzleAdapter(db, { provider: 'pg', schema }),
  })
}

export type Auth = ReturnType<typeof createAuth>
