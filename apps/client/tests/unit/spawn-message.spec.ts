import { parseSpawn } from '$lib/network/spawn-message'
import { describe, expect, it } from 'vitest'

describe('parseSpawn (issue #254)', () => {
  it('reads a point', () => {
    expect(parseSpawn({ x: 300, y: 2300 })).toEqual({ x: 300, y: 2300 })
  })

  it('refuses anything that is not a finite point', () => {
    expect(parseSpawn(undefined)).toBeUndefined()
    expect(parseSpawn({ x: 1 })).toBeUndefined()
    expect(parseSpawn({ x: '1', y: 2 })).toBeUndefined()
    expect(parseSpawn({ x: Number.NaN, y: 2 })).toBeUndefined()
    expect(parseSpawn({ x: 1, y: Number.POSITIVE_INFINITY })).toBeUndefined()
  })
})
