import type { AvatarSpriteType, CharacterSelection } from '@kangeikai/shared'
import type { AuthenticatedUser, Authenticator } from '../../../src/auth/authenticator'

/**
 * Stand-ins for the account lookup in room tests (issue #232): a "ticket" here is just the JSON of
 * the profile the fake authenticator should return, so tests need no database or signing secret.
 * The real ticket and lookup are covered by their own tests (session-ticket.spec.ts, auth.spec.ts).
 */
export const INVALID_TICKET = 'not-a-valid-ticket'

let nextUserNumber = 0

interface JoinAsOptions {
  /** Defaults to a fresh id per call, so two `joinAs` calls are two different accounts. Pass the same one to model one account twice. */
  userId?: string
  characterSelection?: CharacterSelection
  presence?: 'available' | 'busy'
}

/** The join options of a person with the given profile. */
export function joinAs(displayName: string, spriteType: AvatarSpriteType = 'man', options: JoinAsOptions = {}) {
  const profile: AuthenticatedUser = {
    userId: options.userId ?? `user-${++nextUserNumber}`,
    displayName,
    spriteType,
    characterSelection: options.characterSelection,
  }
  return { ticket: JSON.stringify(profile), ...(options.presence ? { presence: options.presence } : {}) }
}

export const fakeAuthenticator: Authenticator = async (ticket) => {
  if (ticket === INVALID_TICKET)
    return null
  try {
    return JSON.parse(ticket) as AuthenticatedUser
  }
  catch {
    return null
  }
}
