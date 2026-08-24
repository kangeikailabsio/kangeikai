import { Avatar } from '$lib/game/entities/avatar'
import { describe, expect, it } from 'vitest'

describe('avatar', () => {
  it('clamps position to the map bounds instead of walking off the edge', () => {
    const mapWidthPx = 320
    const mapHeightPx = 320
    const avatar = new Avatar(0, 0, 'man', mapWidthPx, mapHeightPx)

    avatar.update({ direction: 'left', sprint: false }, 10)
    expect(avatar.x).toBe(0)

    avatar.update({ direction: 'up', sprint: false }, 10)
    expect(avatar.y).toBe(0)

    avatar.x = mapWidthPx
    avatar.y = mapHeightPx
    avatar.update({ direction: 'right', sprint: false }, 10)
    expect(avatar.x).toBe(mapWidthPx)

    avatar.update({ direction: 'down', sprint: false }, 10)
    expect(avatar.y).toBe(mapHeightPx)
  })

  it('moves 1.5x faster and reports motionState "sprinting" while sprint is held', () => {
    const avatar = new Avatar(100, 100, 'man', 1000, 1000)

    avatar.update({ direction: 'right', sprint: false }, 1)
    expect(avatar.x).toBe(300)
    expect(avatar.motionState).toBe('walking')

    avatar.update({ direction: 'right', sprint: true }, 1)
    expect(avatar.x).toBe(600)
    expect(avatar.motionState).toBe('sprinting')
  })
})
