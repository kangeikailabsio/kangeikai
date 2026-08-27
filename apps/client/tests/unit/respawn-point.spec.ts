import type { RespawnRect } from '$lib/game/map/respawn-point'
import { resolveRespawnPoint } from '$lib/game/map/respawn-point'
import { describe, expect, it } from 'vitest'

function sequence(values: number[]): () => number {
  let index = 0
  return () => values[index++]
}

describe('resolveRespawnPoint', () => {
  it('returns the fallback when there are no respawn objects', () => {
    expect(resolveRespawnPoint([], { x: 10, y: 20 })).toEqual({ x: 10, y: 20 })
  })

  it('picks a point inside the single object, proportional to the injected random values', () => {
    const objects: RespawnRect[] = [{ x: 100, y: 200, width: 50, height: 40 }]
    // First call picks the object (only one, any value -> index 0); next two place x/y.
    const random = sequence([0, 0.5, 0.25])
    expect(resolveRespawnPoint(objects, { x: 0, y: 0 }, random)).toEqual({ x: 125, y: 210 })
  })

  it('picks the object matching the first random draw', () => {
    const objects: RespawnRect[] = [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 1000, y: 2000, width: 10, height: 10 },
    ]
    // 0.6 * 2 = 1.2 -> floor 1 -> second object; then x/y both at the object's origin corner.
    const random = sequence([0.6, 0, 0])
    expect(resolveRespawnPoint(objects, { x: -1, y: -1 }, random)).toEqual({ x: 1000, y: 2000 })
  })

  it('clamps the object index even if random() returns exactly 1', () => {
    const objects: RespawnRect[] = [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 1000, y: 2000, width: 10, height: 10 },
    ]
    const random = sequence([1, 0, 0])
    expect(resolveRespawnPoint(objects, { x: -1, y: -1 }, random)).toEqual({ x: 1000, y: 2000 })
  })

  it('stays within the object bounds at the far corner', () => {
    const objects: RespawnRect[] = [{ x: 100, y: 200, width: 50, height: 40 }]
    const random = sequence([0, 0.999, 0.999])
    const point = resolveRespawnPoint(objects, { x: 0, y: 0 }, random)
    expect(point.x).toBeLessThan(150)
    expect(point.y).toBeLessThan(240)
    expect(point.x).toBeGreaterThanOrEqual(100)
    expect(point.y).toBeGreaterThanOrEqual(200)
  })
})
