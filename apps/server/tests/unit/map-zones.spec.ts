import { describe, expect, it } from 'vitest'
import { colliders, mapSize, privateZones, respawnAreas } from '../../src/map-zones'

describe('privateZones', () => {
  it('loads at least one zone from the active map\'s spaces layer', () => {
    expect(privateZones.length).toBeGreaterThan(0)
  })

  it('every zone has a well-formed rectangle and a stable numeric id', () => {
    for (const zone of privateZones) {
      expect(typeof zone.id).toBe('number')
      expect(typeof zone.name).toBe('string')
      expect(typeof zone.x).toBe('number')
      expect(typeof zone.y).toBe('number')
      expect(zone.width).toBeGreaterThan(0)
      expect(zone.height).toBeGreaterThan(0)
    }
  })

  it('every zone id is unique', () => {
    const ids = privateZones.map(zone => zone.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('collision and respawn layers (issue #254)', () => {
  it('loads the collider rectangles of the collisions layer', () => {
    expect(colliders.length).toBeGreaterThan(0)
    for (const collider of colliders) {
      expect(Number.isFinite(collider.x)).toBe(true)
      expect(Number.isFinite(collider.y)).toBe(true)
      expect(collider.width).toBeGreaterThanOrEqual(0)
      expect(collider.height).toBeGreaterThanOrEqual(0)
    }
  })

  it('loads at least one respawn area, with a real size', () => {
    expect(respawnAreas.length).toBeGreaterThan(0)
    for (const area of respawnAreas) {
      expect(area.width).toBeGreaterThan(0)
      expect(area.height).toBeGreaterThan(0)
    }
  })

  it('knows the size of the map in pixels', () => {
    expect(mapSize).toEqual({ width: 2560, height: 2560 })
  })
})
