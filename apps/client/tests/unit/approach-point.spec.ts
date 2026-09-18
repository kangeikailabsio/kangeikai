import { resolveApproachPoint } from '$lib/game/map/approach-point'
import { describe, expect, it } from 'vitest'

describe('resolveApproachPoint', () => {
  it('returns a point standoffPx short of the target, along the straight line from "from"', () => {
    const point = resolveApproachPoint({ x: 0, y: 0 }, { x: 100, y: 0 }, 20)

    expect(point).toEqual({ x: 80, y: 0 })
  })

  it('works along a diagonal line', () => {
    const point = resolveApproachPoint({ x: 0, y: 0 }, { x: 30, y: 40 }, 10)

    // distance is 50, standoff 10 → 40/50 of the way there
    expect(point).toEqual({ x: 24, y: 32 })
  })

  it('returns null when already within standoffPx of the target', () => {
    expect(resolveApproachPoint({ x: 0, y: 0 }, { x: 10, y: 0 }, 20)).toBeNull()
  })

  it('returns null when exactly at the standoff distance', () => {
    expect(resolveApproachPoint({ x: 0, y: 0 }, { x: 20, y: 0 }, 20)).toBeNull()
  })

  it('returns null when already at the target itself', () => {
    expect(resolveApproachPoint({ x: 5, y: 5 }, { x: 5, y: 5 }, 20)).toBeNull()
  })
})
