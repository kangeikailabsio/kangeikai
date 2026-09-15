import { MAX_NAME_LENGTH } from '$lib/entry/constants'
import { avatarTypeSchema, displayNameSchema, guestProfileSchema } from '$lib/entry/guest-profile-schema'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

describe('displayNameSchema', () => {
  it('accepts a normal name, trimmed', () => {
    expect(v.parse(displayNameSchema, '  Eduardo  ')).toBe('Eduardo')
  })

  it('rejects an empty name', () => {
    expect(v.safeParse(displayNameSchema, '').success).toBe(false)
  })

  it('rejects a whitespace-only name', () => {
    expect(v.safeParse(displayNameSchema, '   ').success).toBe(false)
  })

  it('clamps a name longer than MAX_NAME_LENGTH rather than rejecting it (FR-003)', () => {
    const result = v.safeParse(displayNameSchema, 'x'.repeat(100))
    expect(result.success).toBe(true)
    expect(result.success && result.output.length).toBeLessThanOrEqual(MAX_NAME_LENGTH)
  })
})

describe('avatarTypeSchema', () => {
  it('accepts the two valid avatar types', () => {
    expect(v.parse(avatarTypeSchema, 'man')).toBe('man')
    expect(v.parse(avatarTypeSchema, 'woman')).toBe('woman')
  })

  it('rejects anything else', () => {
    expect(v.safeParse(avatarTypeSchema, 'robot').success).toBe(false)
  })
})

describe('guestProfileSchema — character field (issue #168)', () => {
  const validCharacter = {
    selection: {
      body: 1,
      eyes: 1,
      outfit: { style: 1, variant: 1 },
      hairstyle: { style: 1, variant: 1 },
      accessory: null,
    },
    sheets: { idle: 'data:image/png;base64,idle', walk: 'data:image/png;base64,walk' },
  }

  it('falls back to undefined when the stored profile has no character (pre-#168 profiles)', () => {
    const result = v.parse(guestProfileSchema, { displayName: 'Eduardo', avatarType: 'man' })
    expect(result.character).toBeUndefined()
  })

  it('passes through a valid character unchanged', () => {
    const result = v.parse(guestProfileSchema, { displayName: 'Eduardo', avatarType: 'man', character: validCharacter })
    expect(result.character).toEqual(validCharacter)
  })

  it('falls back to undefined (not a parse failure) when character is structurally corrupted', () => {
    const result = v.safeParse(guestProfileSchema, { displayName: 'Eduardo', avatarType: 'man', character: { selection: 'not an object' } })
    expect(result.success).toBe(true)
    expect(result.success && result.output.character).toBeUndefined()
  })
})
