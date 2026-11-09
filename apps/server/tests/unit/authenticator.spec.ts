import { describe, expect, it } from 'vitest'
import { toAuthenticatedUser } from '../../src/auth/authenticator'

const selection = { body: 1, eyes: 2, outfit: { style: 3, variant: 0 }, hairstyle: { style: 4 }, accessory: null }

describe('toAuthenticatedUser (issue #232)', () => {
  it('maps an account row to the room profile', () => {
    expect(toAuthenticatedUser({ id: 7, name: 'Ana', spriteType: 'woman', characterSelection: JSON.stringify(selection) })).toEqual({
      userId: '7',
      displayName: 'Ana',
      spriteType: 'woman',
      characterSelection: selection,
    })
  })

  it('clamps a long name (e.g. from Google) to the avatar limit and trims it', () => {
    const user = toAuthenticatedUser({ id: 1, name: `  ${'a'.repeat(40)}  `, spriteType: 'man', characterSelection: null })

    expect(user.displayName).toBe('a'.repeat(24))
  })

  it('falls back to a placeholder name when the stored name is blank', () => {
    expect(toAuthenticatedUser({ id: 1, name: '   ', spriteType: 'man', characterSelection: null }).displayName).toBe('Guest')
  })

  it('falls back to "man" for a missing or unknown sprite type', () => {
    expect(toAuthenticatedUser({ id: 1, name: 'A', spriteType: null, characterSelection: null }).spriteType).toBe('man')
    expect(toAuthenticatedUser({ id: 1, name: 'A', spriteType: 'robot', characterSelection: null }).spriteType).toBe('man')
  })

  it('drops an unreadable or malformed character selection instead of failing the join', () => {
    expect(toAuthenticatedUser({ id: 1, name: 'A', spriteType: 'man', characterSelection: '{not json' }).characterSelection).toBeUndefined()
    expect(toAuthenticatedUser({ id: 1, name: 'A', spriteType: 'man', characterSelection: '{"body":"x"}' }).characterSelection).toBeUndefined()
    expect(toAuthenticatedUser({ id: 1, name: 'A', spriteType: 'man', characterSelection: '' }).characterSelection).toBeUndefined()
  })
})
