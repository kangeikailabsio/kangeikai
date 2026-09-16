import type { CharacterProfile } from '$lib/entry/guest-profile-schema'
import { buildCharacterManifest } from '$lib/character/character-pieces'
import { composeCharacterSheets } from '$lib/character/compose-character'
import { randomCharacterSelection } from '@kangeikai/shared'

/**
 * A full random selection, already composed into idle/walk sheets — used for a first-time
 * visitor's default avatar and the creator modal's "sortear" button. Every slot is picked
 * independently (no known incompatible combos — issue #167's design decision).
 */
export async function generateRandomCharacterProfile(): Promise<CharacterProfile> {
  const manifest = buildCharacterManifest()
  const selection = randomCharacterSelection(manifest)
  const sheets = await composeCharacterSheets(selection)
  return { selection, sheets }
}
