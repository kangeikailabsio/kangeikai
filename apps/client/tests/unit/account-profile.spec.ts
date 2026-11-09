import { profileFieldsFromUser, profileUpdateBody } from '$lib/account/account-profile'
import { describe, expect, it } from 'vitest'

const selection = { body: 1, eyes: 2, outfit: { style: 3, variant: 0 }, hairstyle: { style: 4 }, accessory: null }
const sheets = { idle: 'data:idle', walk: 'data:walk' }

describe('profileFieldsFromUser (issue #232)', () => {
  it('reads name, avatar type and the stored character selection from the account', () => {
    expect(profileFieldsFromUser({ name: 'Ana', spriteType: 'woman', characterSelection: JSON.stringify(selection) })).toEqual({
      displayName: 'Ana',
      avatarType: 'woman',
      selection,
    })
  })

  it('has no selection for an account that never chose an avatar', () => {
    expect(profileFieldsFromUser({ name: 'Ana', spriteType: 'man', characterSelection: null }).selection).toBeUndefined()
    expect(profileFieldsFromUser({ name: 'Ana' }).selection).toBeUndefined()
  })

  it('falls back to "man" for a missing or unknown sprite type', () => {
    expect(profileFieldsFromUser({ name: 'Ana', spriteType: null }).avatarType).toBe('man')
    expect(profileFieldsFromUser({ name: 'Ana', spriteType: 'robot' }).avatarType).toBe('man')
  })

  it('ignores an unreadable or malformed stored selection instead of throwing', () => {
    expect(profileFieldsFromUser({ name: 'Ana', characterSelection: '{not json' }).selection).toBeUndefined()
    expect(profileFieldsFromUser({ name: 'Ana', characterSelection: '{"body":"x"}' }).selection).toBeUndefined()
  })

  it('clamps a long name (e.g. from Google) to the avatar limit and trims it', () => {
    expect(profileFieldsFromUser({ name: `  ${'a'.repeat(40)}  ` }).displayName).toBe('a'.repeat(24))
  })
})

describe('profileUpdateBody (issue #232)', () => {
  it('sends the selection only, never the composed sheets (the client rebuilds those)', () => {
    const body = profileUpdateBody({ displayName: 'Ana', avatarType: 'woman', character: { selection, sheets } })

    expect(body).toEqual({ displayName: 'Ana', spriteType: 'woman', characterSelection: selection })
    expect(JSON.stringify(body)).not.toContain('data:')
  })

  it('omits the selection when there is no character yet', () => {
    expect(profileUpdateBody({ displayName: 'Ana', avatarType: 'man' })).toEqual({ displayName: 'Ana', spriteType: 'man' })
  })
})
