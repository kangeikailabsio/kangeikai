import { applyPositionCorrection } from '$lib/game/input/position-correction'
import { describe, expect, it, vi } from 'vitest'

describe('applyPositionCorrection (issue #255)', () => {
  it('puts the avatar back where the server says and stops the walk in progress', () => {
    const avatar = { x: 900, y: 800 }
    const autoWalk = { cancel: vi.fn() }

    applyPositionCorrection(avatar, autoWalk, { x: 310, y: 2320 })

    expect(avatar).toEqual({ x: 310, y: 2320 })
    expect(autoWalk.cancel).toHaveBeenCalledOnce()
  })
})
