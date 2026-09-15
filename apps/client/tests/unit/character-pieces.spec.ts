import { buildCharacterManifest, resolvePieceUrl } from '$lib/character/character-pieces'
import { describe, expect, it } from 'vitest'

describe('buildCharacterManifest', () => {
  const manifest = buildCharacterManifest()

  it('finds every bundled piece per slot', () => {
    expect(manifest.body).toHaveLength(9)
    expect(manifest.eyes).toHaveLength(7)
    expect(manifest.outfit).toHaveLength(132)
    expect(manifest.hairstyle).toHaveLength(200)
    expect(manifest.accessory).toHaveLength(84)
  })

  it('parses body/eyes as style-only pieces', () => {
    expect(manifest.body).toContain(3)
    expect(manifest.eyes).toContain(5)
  })

  it('parses outfit style 1 with its 10 variants (irregular counts across styles)', () => {
    const style1Variants = manifest.outfit.filter(piece => piece.style === 1).map(piece => piece.variant)
    expect(style1Variants.sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('parses multi-word accessory names without swallowing the style/variant numbers', () => {
    // accessory-05-dino-snapback-01.png through -03.png
    const style5Variants = manifest.accessory.filter(piece => piece.style === 5).map(piece => piece.variant)
    expect(style5Variants.sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2, 3])
  })
})

describe('resolvePieceUrl', () => {
  it('resolves a style-only piece', () => {
    expect(resolvePieceUrl('body', { style: 3 })).toMatch(/body-03/)
  })

  it('resolves a style+variant piece', () => {
    expect(resolvePieceUrl('outfit', { style: 3, variant: 4 })).toMatch(/outfit-03-04/)
  })

  it('resolves a multi-word accessory piece', () => {
    expect(resolvePieceUrl('accessory', { style: 5, variant: 2 })).toMatch(/accessory-05-dino-snapback-02/)
  })

  it('returns undefined for a piece that does not exist', () => {
    expect(resolvePieceUrl('body', { style: 999 })).toBeUndefined()
  })
})
