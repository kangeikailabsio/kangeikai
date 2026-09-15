import type { CharacterManifest } from '@kangeikai/shared'
import { isValidCharacterSelection, nearestVariant, randomCharacterSelection, stylesOf, variantsOf } from '@kangeikai/shared'
import { describe, expect, it } from 'vitest'

const manifest: CharacterManifest = {
  body: [1, 2, 3],
  eyes: [1, 2],
  outfit: [{ style: 1, variant: 1 }, { style: 1, variant: 2 }, { style: 2, variant: 1 }],
  hairstyle: [{ style: 1, variant: 1 }],
  accessory: [{ style: 1, variant: 1 }, { style: 2, variant: 1 }],
}

describe('isValidCharacterSelection', () => {
  it('accepts a selection made entirely of pieces in the manifest', () => {
    expect(isValidCharacterSelection({
      body: 2,
      eyes: 1,
      outfit: { style: 1, variant: 2 },
      hairstyle: { style: 1, variant: 1 },
      accessory: { style: 2, variant: 1 },
    }, manifest)).toBe(true)
  })

  it('accepts accessory: null as a valid "none equipped" state', () => {
    expect(isValidCharacterSelection({
      body: 1,
      eyes: 1,
      outfit: { style: 1, variant: 1 },
      hairstyle: { style: 1, variant: 1 },
      accessory: null,
    }, manifest)).toBe(true)
  })

  it('rejects a body style not in the manifest', () => {
    expect(isValidCharacterSelection({
      body: 99,
      eyes: 1,
      outfit: { style: 1, variant: 1 },
      hairstyle: { style: 1, variant: 1 },
      accessory: null,
    }, manifest)).toBe(false)
  })

  it('rejects an outfit variant that does not exist for that style', () => {
    expect(isValidCharacterSelection({
      body: 1,
      eyes: 1,
      outfit: { style: 1, variant: 99 },
      hairstyle: { style: 1, variant: 1 },
      accessory: null,
    }, manifest)).toBe(false)
  })

  it('rejects an accessory piece not in the manifest', () => {
    expect(isValidCharacterSelection({
      body: 1,
      eyes: 1,
      outfit: { style: 1, variant: 1 },
      hairstyle: { style: 1, variant: 1 },
      accessory: { style: 99, variant: 1 },
    }, manifest)).toBe(false)
  })
})

describe('randomCharacterSelection', () => {
  it('picks the first option of every slot when random() always returns 0', () => {
    expect(randomCharacterSelection(manifest, () => 0)).toEqual({
      body: 1,
      eyes: 1,
      outfit: { style: 1, variant: 1 },
      hairstyle: { style: 1, variant: 1 },
      accessory: { style: 1, variant: 1 },
    })
  })

  it('treats "no accessory" as just another option in the accessory pool', () => {
    // accessory pool is [piece, piece, null] — a value near 1 lands on the last (null) slot.
    const selection = randomCharacterSelection(manifest, () => 0.99)
    expect(selection.accessory).toBeNull()
  })

  it('always returns a selection valid against the same manifest', () => {
    for (const random of [0, 0.25, 0.5, 0.75, 0.99]) {
      expect(isValidCharacterSelection(randomCharacterSelection(manifest, () => random), manifest)).toBe(true)
    }
  })
})

describe('stylesOf', () => {
  it('returns every distinct style, ascending, without duplicates', () => {
    expect(stylesOf(manifest.outfit)).toEqual([1, 2])
  })
})

describe('variantsOf', () => {
  it('returns only the variants that exist for that style, ascending', () => {
    expect(variantsOf(manifest.outfit, 1)).toEqual([1, 2])
    expect(variantsOf(manifest.outfit, 2)).toEqual([1])
  })

  it('returns an empty list for a style with no pieces', () => {
    expect(variantsOf(manifest.outfit, 99)).toEqual([])
  })
})

describe('nearestVariant', () => {
  it('keeps the exact variant when it exists in the new style', () => {
    expect(nearestVariant([1, 2, 3, 4], 2)).toBe(2)
  })

  it('falls back to the closest variant when the exact one does not exist', () => {
    expect(nearestVariant([1, 2, 3], 5)).toBe(3)
    expect(nearestVariant([3, 4, 5], 1)).toBe(3)
  })

  it('picks the nearer of two equally-spaced options by iteration order', () => {
    // 2 and 4 are both 1 away from 3 — reduce() keeps the first one found ("closest" starts as
    // the first element, and a candidate only replaces it on a *strictly* smaller distance).
    expect(nearestVariant([2, 4], 3)).toBe(2)
  })
})
