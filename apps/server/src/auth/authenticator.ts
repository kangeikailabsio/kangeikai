import type { AvatarSpriteType, CharacterSelection } from '@kangeikai/shared'
import type { Db } from '../db/client'
import { MAX_NAME_LENGTH } from '@kangeikai/shared'
import { eq } from 'drizzle-orm'
import * as v from 'valibot'
import { user } from '../db/schema'
import { characterSelectionSchema, spriteTypeSchema } from '../rooms/message-schemas'
import { verifySessionTicket } from './session-ticket'

/** What the room needs to know about a person, taken from their account. */
export interface AuthenticatedUser {
  userId: string
  displayName: string
  spriteType: AvatarSpriteType
  characterSelection: CharacterSelection | undefined
}

/** Turns a ticket from the join options into the account's profile, or `null` when it is not valid. */
export type Authenticator = (ticket: string) => Promise<AuthenticatedUser | null>

interface UserRow {
  id: number
  name: string
  spriteType: string | null
  characterSelection: string | null
}

function parseCharacterSelection(raw: string | null): CharacterSelection | undefined {
  if (!raw)
    return undefined
  try {
    const result = v.safeParse(characterSelectionSchema, JSON.parse(raw))
    return result.success ? result.output : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Maps an account row to the room's view of it. Lenient on purpose, since the row can come from
 * Google sign-in (long names) or an older profile: a name is clamped to the avatar limit, an unknown
 * sprite falls back to "man" and an unreadable character selection to none.
 */
export function toAuthenticatedUser(row: UserRow): AuthenticatedUser {
  const spriteType = v.safeParse(spriteTypeSchema, row.spriteType)
  return {
    userId: String(row.id),
    displayName: row.name.trim().slice(0, MAX_NAME_LENGTH) || 'Guest',
    spriteType: spriteType.success ? spriteType.output : 'man',
    characterSelection: parseCharacterSelection(row.characterSelection),
  }
}

export function createAuthenticator(secret: string, db: Db): Authenticator {
  return async (ticket) => {
    const userId = verifySessionTicket(ticket, secret)
    if (userId === null)
      return null

    const [row] = await db.select().from(user).where(eq(user.id, Number(userId)))
    return row ? toAuthenticatedUser(row) : null
  }
}
