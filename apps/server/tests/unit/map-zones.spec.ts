import { describe, expect, it } from 'vitest'
import { privateZones } from '../../src/map-zones'

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
