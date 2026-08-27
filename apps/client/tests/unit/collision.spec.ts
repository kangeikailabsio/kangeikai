import type { CollisionRect } from '$lib/game/map/collision'
import { collidesWithAny, rectsOverlap } from '$lib/game/map/collision'
import { describe, expect, it } from 'vitest'

describe('rectsOverlap', () => {
  it('detects overlapping rects', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true)
  })

  it('detects rects that do not overlap', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 20, width: 10, height: 10 })).toBe(false)
  })

  it('treats merely touching edges as not overlapping', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false)
  })

  it('never overlaps a zero-width or zero-height rect', () => {
    expect(rectsOverlap({ x: 5, y: 5, width: 10, height: 10 }, { x: 5, y: 5, width: 0, height: 10 })).toBe(false)
    expect(rectsOverlap({ x: 5, y: 5, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 0 })).toBe(false)
  })
})

describe('collidesWithAny', () => {
  const obstacles: CollisionRect[] = [
    { x: 0, y: 0, width: 10, height: 10 },
    { x: 100, y: 100, width: 10, height: 10 },
  ]

  it('returns true when the box overlaps any obstacle', () => {
    expect(collidesWithAny({ x: 5, y: 5, width: 4, height: 4 }, obstacles)).toBe(true)
  })

  it('returns false when the box overlaps none of the obstacles', () => {
    expect(collidesWithAny({ x: 50, y: 50, width: 4, height: 4 }, obstacles)).toBe(false)
  })

  it('returns false with no obstacles', () => {
    expect(collidesWithAny({ x: 0, y: 0, width: 4, height: 4 }, [])).toBe(false)
  })
})
