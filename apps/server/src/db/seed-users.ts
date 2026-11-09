import type { Auth } from '../auth/auth'
import type { Db } from './client'
import { eq } from 'drizzle-orm'
import { user } from './schema'

export interface DevUser {
  name: string
  email: string
  spriteType: 'man' | 'woman'
}

/** Shared password of every dev account. Public on purpose: these exist only in a local database. */
export const DEV_USER_PASSWORD = 'dev-password-123'

export const DEV_USERS: readonly DevUser[] = [
  { name: 'Ana Dev', email: 'ana@dev.test', spriteType: 'woman' },
  { name: 'Bruno Dev', email: 'bruno@dev.test', spriteType: 'man' },
]

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'postgres'])

/**
 * The seed has a known password, so it must never touch a real database: only a local
 * `DATABASE_URL` (or the compose service name) is accepted.
 */
export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(databaseUrl).hostname)
  }
  catch {
    return false
  }
}

/** Creates the dev accounts that do not exist yet, through better-auth (so passwords are hashed the normal way). Returns the emails it created. */
export async function seedDevUsers(auth: Auth, db: Db): Promise<string[]> {
  const created: string[] = []
  for (const dev of DEV_USERS) {
    const [existing] = await db.select({ id: user.id }).from(user).where(eq(user.email, dev.email))
    if (existing)
      continue

    await auth.api.signUpEmail({ body: { name: dev.name, email: dev.email, password: DEV_USER_PASSWORD } })
    // `spriteType` is not client-writable through sign up, so it is set directly.
    await db.update(user).set({ spriteType: dev.spriteType }).where(eq(user.email, dev.email))
    created.push(dev.email)
  }
  return created
}
