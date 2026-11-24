import type { Application, Request, Response } from 'express'
import type { Auth } from '../auth/auth'
import type { AuthConfig } from '../auth/auth-config'
import type { Db } from '../db/client'
import { fromNodeHeaders } from 'better-auth/node'
import { eq } from 'drizzle-orm'
import express from 'express'
import * as v from 'valibot'
import { profileUpdateSchema } from '../auth/profile-schema'
import { createSessionTicket } from '../auth/session-ticket'
import { user } from '../db/schema'
import { accountCors, requireTrustedOrigin } from './cors'
import { RateLimiter } from './rate-limiter'

async function currentUserId(auth: Auth, req: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  return session ? String(session.user.id) : null
}

const ONE_MINUTE_MS = 60_000
/** A join, a reconnect or a few open tabs fit easily in a minute (issue #293). */
const TICKETS_PER_MINUTE = 30
const PROFILE_SAVES_PER_MINUTE = 10

/** One counter per endpoint, keyed by account. Injected so tests can use a clock and small limits. */
export interface AccountLimiters {
  ticket: RateLimiter
  profile: RateLimiter
}

export function createAccountLimiters(now: () => number = Date.now): AccountLimiters {
  return {
    ticket: new RateLimiter(TICKETS_PER_MINUTE, ONE_MINUTE_MS, now),
    profile: new RateLimiter(PROFILE_SAVES_PER_MINUTE, ONE_MINUTE_MS, now),
  }
}

/** Answers 429 when `userId` is over the limit and says so; the caller stops when this returns `true`. */
function rejectedByLimit(limiter: RateLimiter, userId: string, res: Response): boolean {
  const result = limiter.check(userId)
  if (result.allowed)
    return false
  res.setHeader('Retry-After', String(result.retryAfterSeconds))
  res.status(429).json({ message: 'Too many requests', code: 'RATE_LIMITED' })
  return true
}

/**
 * The two account endpoints the web client needs besides better-auth's own (issue #232), both
 * authenticated by the session cookie:
 *
 * - `POST /api/session-ticket` — a short-lived pass to show when joining the office room.
 * - `PUT /api/profile` — the person's own name and avatar (not writable through better-auth's
 *   generic endpoints, so the values are validated here).
 *
 * Each is limited per signed-in account (`limiters`); someone who is not signed in gets 401 before
 * anything is counted.
 */
export function registerAccountRoutes(app: Application, auth: Auth, config: AuthConfig, db: Db, limiters: AccountLimiters = createAccountLimiters()): void {
  const guard = [...accountCors(config), requireTrustedOrigin(config)]

  app.post('/api/session-ticket', ...guard, async (req, res) => {
    const userId = await currentUserId(auth, req)
    if (userId === null) {
      res.status(401).json({ message: 'Not signed in', code: 'UNAUTHORIZED' })
      return
    }
    if (rejectedByLimit(limiters.ticket, userId, res))
      return
    res.json({ ticket: createSessionTicket(userId, config.secret) })
  })

  app.put('/api/profile', ...guard, express.json(), async (req, res) => {
    const userId = await currentUserId(auth, req)
    if (userId === null) {
      res.status(401).json({ message: 'Not signed in', code: 'UNAUTHORIZED' })
      return
    }
    if (rejectedByLimit(limiters.profile, userId, res))
      return

    const result = v.safeParse(profileUpdateSchema, req.body)
    if (!result.success) {
      res.status(400).json({ message: result.issues[0]?.message ?? 'Invalid profile', code: 'INVALID_PROFILE' })
      return
    }

    const { displayName, spriteType, characterSelection } = result.output
    await db.update(user)
      .set({ name: displayName, spriteType, characterSelection: characterSelection ? JSON.stringify(characterSelection) : null })
      .where(eq(user.id, Number(userId)))
    res.json({ displayName, spriteType, characterSelection: characterSelection ?? null })
  })
}
