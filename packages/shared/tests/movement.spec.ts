import { describe, expect, it } from 'vitest'
import { COLLISION_HITBOX_HEIGHT, COLLISION_HITBOX_WIDTH, feetHitbox, SPRITE_HEIGHT } from '../src/movement'

describe('feetHitbox', () => {
  it('is a small box at the sprite\'s feet, centred on the avatar horizontally', () => {
    expect(feetHitbox(100, 200)).toEqual({
      x: 100 - COLLISION_HITBOX_WIDTH / 2,
      y: 200 + SPRITE_HEIGHT / 2 - COLLISION_HITBOX_HEIGHT,
      width: COLLISION_HITBOX_WIDTH,
      height: COLLISION_HITBOX_HEIGHT,
    })
  })

  it('moves with the avatar', () => {
    const a = feetHitbox(0, 0)
    const b = feetHitbox(10, 20)

    expect(b.x - a.x).toBe(10)
    expect(b.y - a.y).toBe(20)
  })
})
