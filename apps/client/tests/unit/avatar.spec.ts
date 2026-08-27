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

  it('does not move into a collider blocking the step', () => {
    const avatar = new Avatar(100, 100, 'man', 10000, 10000)
    // Overlaps the feet hitbox (x:110-130, y:120-132) at the position the step would land on.
    avatar.setColliders([{ x: 125, y: 115, width: 20, height: 30 }])

    avatar.update({ direction: 'right', sprint: false }, 0.1)

    expect(avatar.x).toBe(100)
    expect(avatar.y).toBe(100)
  })

  it('still turns to face a blocked direction even though it does not move', () => {
    const avatar = new Avatar(100, 100, 'man', 10000, 10000)
    avatar.setColliders([{ x: 125, y: 115, width: 20, height: 30 }])

    avatar.update({ direction: 'right', sprint: false }, 0.1)

    expect(avatar.direction).toBe('right')
    expect(avatar.motionState).toBe('walking')
  })

  it('moves normally when no collider is in the way', () => {
    const avatar = new Avatar(100, 100, 'man', 10000, 10000)
    avatar.setColliders([{ x: 1000, y: 1000, width: 20, height: 20 }])

    avatar.update({ direction: 'right', sprint: false }, 0.1)

    expect(avatar.x).toBe(120)
  })

  it('only collides at the feet, not the full sprite — an obstacle above the feet hitbox does not block', () => {
    const avatar = new Avatar(100, 100, 'man', 10000, 10000)
    // In the step's x column but well above the feet hitbox (y:120-132).
    avatar.setColliders([{ x: 110, y: 60, width: 20, height: 40 }])

    avatar.update({ direction: 'right', sprint: false }, 0.1)

    expect(avatar.x).toBe(120)
  })
})
