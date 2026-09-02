import { resolveHoverTargetPosition } from '$lib/game/entities/avatar-hover'
import { describe, expect, it } from 'vitest'

describe('resolveHoverTargetPosition', () => {
  it('returns undefined when nothing is hovered', () => {
    expect(resolveHoverTargetPosition(undefined, { x: 1, y: 2 }, new Map())).toBeUndefined()
  })

  it('returns the local position when the local avatar is hovered', () => {
    const local = { x: 10, y: 20 }

    expect(resolveHoverTargetPosition('local', local, new Map())).toEqual(local)
  })

  it('returns the matching remote position when a remote avatar is hovered', () => {
    const remote = new Map([['session-1', { x: 30, y: 40 }]])

    expect(resolveHoverTargetPosition('session-1', { x: 0, y: 0 }, remote)).toEqual({ x: 30, y: 40 })
  })

  it('returns undefined when the hovered remote avatar no longer exists', () => {
    const remote = new Map([['session-1', { x: 30, y: 40 }]])

    expect(resolveHoverTargetPosition('session-2', { x: 0, y: 0 }, remote)).toBeUndefined()
  })
})
