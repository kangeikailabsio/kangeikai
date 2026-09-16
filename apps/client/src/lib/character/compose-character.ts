import type { CharacterPieceRef, CharacterSelection, CharacterSlot } from '@kangeikai/shared'
import { resolvePieceUrl } from '$lib/character/character-pieces'

const FRAME_SHEET_WIDTH = 768
const FRAME_SHEET_HEIGHT = 64

/**
 * Every piece (any slot, any style/variant) shares the same master grid: 64px-tall rows, one
 * per animation. Row 1 (y: 64) is `idle`, row 2 (y: 128) is `walk` — found via the pack's
 * `Spritesheet_animations_GUIDE.png` and confirmed by cropping a real piece and comparing it to
 * the existing avatar-man-idle.png (see issue #167). Both rows are 768×64 (24 frames), matching
 * that same existing sheet format exactly.
 */
const IDLE_ROW_Y = 64
const WALK_ROW_Y = 128

/**
 * Draw order, back to front. Not documented by the asset pack — determined by visual
 * inspection of composed output; revisit here if a future piece needs a different stacking
 * (e.g. an accessory meant to sit under hair instead of over it).
 */
const LAYER_ORDER: readonly { slot: CharacterSlot, ref: (selection: CharacterSelection) => CharacterPieceRef | null }[] = [
  { slot: 'body', ref: selection => ({ style: selection.body }) },
  { slot: 'outfit', ref: selection => selection.outfit },
  { slot: 'hairstyle', ref: selection => selection.hairstyle },
  { slot: 'eyes', ref: selection => ({ style: selection.eyes }) },
  { slot: 'accessory', ref: selection => selection.accessory },
]

/** Exported for reuse wherever an already-composed sheet (a data URL) needs to become an `HTMLImageElement` again — e.g. office-scene.ts registering a remote player's composed sheets as a Phaser texture (issue #171). */
export function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load image: ${url}`))
    image.src = url
  })
}

function composeRow(images: readonly HTMLImageElement[], rowY: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = FRAME_SHEET_WIDTH
  canvas.height = FRAME_SHEET_HEIGHT
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('2D canvas context unavailable')

  for (const image of images)
    context.drawImage(image, 0, rowY, FRAME_SHEET_WIDTH, FRAME_SHEET_HEIGHT, 0, 0, FRAME_SHEET_WIDTH, FRAME_SHEET_HEIGHT)

  return canvas.toDataURL('image/png')
}

export interface ComposedCharacterSheets {
  idle: string
  walk: string
}

/**
 * Composes the selected pieces into combined `idle`/`walk` spritesheets — flatten-on-select
 * (issue #167's design decision), not runtime layering, so the result drops straight into the
 * existing Phaser animation pipeline (`AVATAR_FRAME_RANGES`/`MOTION_STATE_ANIMATIONS`) unchanged.
 */
export async function composeCharacterSheets(selection: CharacterSelection): Promise<ComposedCharacterSheets> {
  const urls = LAYER_ORDER
    .map((layer) => {
      const ref = layer.ref(selection)
      return ref ? resolvePieceUrl(layer.slot, ref) : undefined
    })
    .filter((url): url is string => url !== undefined)

  const images = await Promise.all(urls.map(loadImageElement))

  return {
    idle: composeRow(images, IDLE_ROW_Y),
    walk: composeRow(images, WALK_ROW_Y),
  }
}
