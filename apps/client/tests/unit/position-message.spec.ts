import { parsePosition } from '$lib/network/position-message'
import { describe, expect, it } from 'vitest'

describe('parsePosition (issue #254)', () => {
  it('reads a point', () => {
    expect(parsePosition({ x: 300, y: 2300 })).toEqual({ x: 300, y: 2300 })
  })

  it('refuses anything that is not a finite point', () => {
    expect(parsePosition(undefined)).toBeUndefined()
    expect(parsePosition({ x: 1 })).toBeUndefined()
    expect(parsePosition({ x: '1', y: 2 })).toBeUndefined()
    expect(parsePosition({ x: Number.NaN, y: 2 })).toBeUndefined()
    expect(parsePosition({ x: 1, y: Number.POSITIVE_INFINITY })).toBeUndefined()
  })
})
