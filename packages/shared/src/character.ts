export type CharacterSlot = 'body' | 'eyes' | 'outfit' | 'hairstyle' | 'accessory'

/**
 * A piece within a slot's variant grid. `body`/`eyes` only vary by `style`; `outfit`/
 * `hairstyle`/`accessory` also vary by `variant` (a color/pattern option within that style).
 */
export interface CharacterPieceRef {
  style: number
  variant?: number
}

export interface CharacterSelection {
  body: number
  eyes: number
  outfit: CharacterPieceRef
  hairstyle: CharacterPieceRef
  /** `null` means no accessory equipped — a valid, default-able state, not an error. */
  accessory: CharacterPieceRef | null
}

/**
 * Which pieces actually exist for each slot. Built by the client from the real asset files
 * (this package has no images — see AGENTS.md's packages/shared vs. apps/client split), so
 * validation and random selection never drift from what's actually on disk.
 */
export interface CharacterManifest {
  body: readonly number[]
  eyes: readonly number[]
  outfit: readonly CharacterPieceRef[]
  hairstyle: readonly CharacterPieceRef[]
  accessory: readonly CharacterPieceRef[]
}

function hasPiece(pieces: readonly CharacterPieceRef[], ref: CharacterPieceRef): boolean {
  return pieces.some(piece => piece.style === ref.style && piece.variant === ref.variant)
}

/** No slot has known-incompatible combinations with another — each is checked independently. */
export function isValidCharacterSelection(selection: CharacterSelection, manifest: CharacterManifest): boolean {
  return manifest.body.includes(selection.body)
    && manifest.eyes.includes(selection.eyes)
    && hasPiece(manifest.outfit, selection.outfit)
    && hasPiece(manifest.hairstyle, selection.hairstyle)
    && (selection.accessory === null || hasPiece(manifest.accessory, selection.accessory))
}

function pickOne<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]
}

/**
 * Every slot is sorted independently (no known incompatible combos). `accessory` treats "none"
 * as just another option in its pool, alongside every real piece, rather than a special-cased
 * probability — so a random avatar is about as likely to have no accessory as to have any one
 * specific accessory. `random` is injectable so tests can be deterministic.
 */
export function randomCharacterSelection(manifest: CharacterManifest, random: () => number = Math.random): CharacterSelection {
  const accessoryOptions: readonly (CharacterPieceRef | null)[] = [...manifest.accessory, null]

  return {
    body: pickOne(manifest.body, random),
    eyes: pickOne(manifest.eyes, random),
    outfit: pickOne(manifest.outfit, random),
    hairstyle: pickOne(manifest.hairstyle, random),
    accessory: pickOne(accessoryOptions, random),
  }
}
