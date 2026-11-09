import type { Profile } from '$lib/entry/profile-schema'
import type { AvatarSpriteType, CharacterSelection } from '@kangeikai/shared'
import { avatarTypeSchema, characterSelectionSchema, displayNameSchema } from '$lib/entry/profile-schema'
import * as v from 'valibot'

/** The fields of the signed-in user (better-auth's session) that make up the avatar. */
export interface AccountUser {
  name: string
  spriteType?: string | null
  characterSelection?: string | null
}

export interface AccountProfileFields {
  displayName: string
  avatarType: AvatarSpriteType
  /** `undefined` for an account that never chose an avatar. */
  selection: CharacterSelection | undefined
}

function parseSelection(raw: string | null | undefined): CharacterSelection | undefined {
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
 * Reads the avatar out of the signed-in user. Lenient like the server's own reading of the same
 * row: a long name (Google) is clamped, an unknown sprite becomes "man", an unreadable selection
 * becomes none — the entry form then lets the person fix it.
 */
export function profileFieldsFromUser(user: AccountUser): AccountProfileFields {
  const avatarType = v.safeParse(avatarTypeSchema, user.spriteType)
  const name = v.safeParse(displayNameSchema, user.name)
  return {
    displayName: name.success ? name.output : '',
    avatarType: avatarType.success ? avatarType.output : 'man',
    selection: parseSelection(user.characterSelection),
  }
}

export interface ProfileUpdateBody {
  displayName: string
  spriteType: AvatarSpriteType
  characterSelection?: CharacterSelection
}

/** The `PUT /api/profile` body: the selection only — the composed sheets are rebuilt on the client, never stored. */
export function profileUpdateBody(profile: Profile): ProfileUpdateBody {
  return {
    displayName: profile.displayName,
    spriteType: profile.avatarType,
    ...(profile.character ? { characterSelection: profile.character.selection } : {}),
  }
}
