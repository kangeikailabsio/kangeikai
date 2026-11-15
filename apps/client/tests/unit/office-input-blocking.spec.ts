import { blocksOfficeInput } from '$lib/game/games/game-input'
import { describe, expect, it } from 'vitest'

describe('office input blocking', () => {
  it('blocks office controls for game, busy, screen share, or typing, and restores them when cleared', () => {
    const idle = { gameOpen: false, screenShareOpen: false, attentionOpen: false, busy: false, typing: false }
    expect(blocksOfficeInput(idle)).toBe(false)
    for (const key of Object.keys(idle))
      expect(blocksOfficeInput({ ...idle, [key]: true })).toBe(true)
    expect(blocksOfficeInput(idle)).toBe(false)
  })
})
