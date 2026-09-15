import type { CharacterManifest, CharacterPieceRef, CharacterSlot } from '@kangeikai/shared'

// Relative glob path, not the $lib alias — mirrors active-map.ts's tileset glob, since Vite's
// import.meta.glob needs a statically analyzable pattern and this project's existing glob usage
// already avoids the alias here.
const pieceUrls = import.meta.glob('../assets/character-pieces/*/*.png', { query: '?url', import: 'default', eager: true }) as Record<string, string>

const SLOTS: readonly CharacterSlot[] = ['body', 'eyes', 'outfit', 'hairstyle', 'accessory']

interface CharacterPieceEntry {
  slot: CharacterSlot
  ref: CharacterPieceRef
  url: string
}

/**
 * Pulls the slot out of the path (`.../character-pieces/<slot>/<file>.png`) and the piece's
 * numbers out of the filename — first digit run is `style`, and for slots with more than one
 * (outfit/hairstyle/accessory) the last digit run is `variant`. Accessory filenames also carry a
 * name between the two (e.g. `accessory-05-dino-snapback-01.png`), but it's never numeric, so
 * this doesn't need a per-slot pattern to skip over it.
 */
function parsePiecePath(path: string): CharacterPieceEntry | 'unknown' {
  const match = path.match(/character-pieces\/([^/]+)\/([^/]+)\.png$/)
  if (!match)
    return 'unknown'

  const [, rawSlot, filename] = match
  const slot = SLOTS.find(candidate => candidate === rawSlot)
  const numbers = filename.match(/\d+/g)?.map(Number) ?? []
  if (!slot || numbers.length === 0)
    return 'unknown'

  const ref: CharacterPieceRef = slot === 'body' || slot === 'eyes'
    ? { style: numbers[0] }
    : { style: numbers[0], variant: numbers.at(-1) }

  return { slot, ref, url: '' }
}

const pieceEntries: CharacterPieceEntry[] = Object.entries(pieceUrls)
  .map(([path, url]) => {
    const parsed = parsePiecePath(path)
    return parsed === 'unknown' ? null : { ...parsed, url }
  })
  .filter((entry): entry is CharacterPieceEntry => entry !== null)

function refsForSlot(slot: CharacterSlot): CharacterPieceRef[] {
  return pieceEntries.filter(entry => entry.slot === slot).map(entry => entry.ref)
}

/** Built from the files actually bundled under `character-pieces/`, so it never drifts from what's on disk. */
export function buildCharacterManifest(): CharacterManifest {
  return {
    body: refsForSlot('body').map(ref => ref.style),
    eyes: refsForSlot('eyes').map(ref => ref.style),
    outfit: refsForSlot('outfit'),
    hairstyle: refsForSlot('hairstyle'),
    accessory: refsForSlot('accessory'),
  }
}

export function resolvePieceUrl(slot: CharacterSlot, ref: CharacterPieceRef): string | undefined {
  return pieceEntries.find(entry => entry.slot === slot && entry.ref.style === ref.style && entry.ref.variant === ref.variant)?.url
}
