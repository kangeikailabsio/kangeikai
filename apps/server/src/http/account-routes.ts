import type { Application, Request } from 'express'
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

async function currentUserId(auth: Auth, req: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) })
  return session ? String(session.user.id) : null
}

/**
 * The two account endpoints the web client needs besides better-auth's own (issue #232), both
 * authenticated by the session cookie:
 *
 * - `POST /api/session-ticket` — a short-lived pass to show when joining the office room.
 * - `PUT /api/profile` — the person's own name and avatar (not writable through better-auth's
 *   generic endpoints, so the values are validated here).
 */
export function registerAccountRoutes(app: Application, auth: Auth, config: AuthConfig, db: Db): void {
  const guard = [...accountCors(config), requireTrustedOrigin(config)]

  app.post('/api/session-ticket', ...guard, async (req, res) => {
    const userId = await currentUserId(auth, req)
    if (userId === null) {
      res.status(401).json({ message: 'Not signed in', code: 'UNAUTHORIZED' })
      return
    }
    res.json({ ticket: createSessionTicket(userId, config.secret) })
  })

  app.put('/api/profile', ...guard, express.json(), async (req, res) => {
    const userId = await currentUserId(auth, req)
    if (userId === null) {
      res.status(401).json({ message: 'Not signed in', code: 'UNAUTHORIZED' })
      return
    }

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
