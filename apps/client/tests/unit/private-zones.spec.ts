import type { TiledSpaceObject } from '$lib/game/map/private-zones'
import { privateZoneAt, resolvePrivateZones } from '$lib/game/map/private-zones'
import { describe, expect, it } from 'vitest'

describe('resolvePrivateZones', () => {
  it('keeps objects flagged private: true', () => {
    const objects: TiledSpaceObject[] = [
      { id: 12, name: 'desk-01', x: 0, y: 0, width: 100, height: 100, properties: [{ name: 'private', value: true }] },
    ]
    expect(resolvePrivateZones(objects)).toEqual([{ id: 12, name: 'desk-01', x: 0, y: 0, width: 100, height: 100 }])
  })

  it('drops objects without the private property', () => {
    const objects: TiledSpaceObject[] = [{ id: 1, name: 'decoration', x: 0, y: 0, width: 10, height: 10 }]
    expect(resolvePrivateZones(objects)).toEqual([])
  })

  it('drops objects with private: false', () => {
    const objects: TiledSpaceObject[] = [
      { id: 2, name: 'not-private', x: 0, y: 0, width: 10, height: 10, properties: [{ name: 'private', value: false }] },
    ]
    expect(resolvePrivateZones(objects)).toEqual([])
  })

  it('returns an empty list for no objects', () => {
    expect(resolvePrivateZones([])).toEqual([])
  })
})

describe('privateZoneAt', () => {
  const zones = [
    { id: 1, name: 'desk-01', x: 0, y: 0, width: 100, height: 100 },
    { id: 2, name: 'meeting-room', x: 200, y: 0, width: 100, height: 100 },
  ]

  it('returns the zone for a point inside its bounds', () => {
    expect(privateZoneAt(zones, 50, 50)).toEqual(zones[0])
    expect(privateZoneAt(zones, 250, 50)).toEqual(zones[1])
  })

  it('treats bounds as inclusive of the zone edges', () => {
    expect(privateZoneAt(zones, 0, 0)).toEqual(zones[0])
    expect(privateZoneAt(zones, 100, 100)).toEqual(zones[0])
  })

  it('returns null outside every zone', () => {
    expect(privateZoneAt(zones, 150, 50)).toBeNull()
  })

  it('returns null when there are no zones', () => {
    expect(privateZoneAt([], 50, 50)).toBeNull()
  })
})
