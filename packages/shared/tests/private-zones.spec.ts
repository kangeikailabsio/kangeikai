import type { PrivateZone, TiledSpaceObject } from '../src/private-zones'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { findOverlappingZones, privateZoneAt, resolvePrivateZones } from '../src/private-zones'

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

describe('findOverlappingZones (issue #280)', () => {
  const zone = (id: number, x: number, y: number, width: number, height: number): PrivateZone => ({ id, name: `zone-${id}`, x, y, width, height })

  it('finds nothing for no zones, one zone or disjoint zones', () => {
    expect(findOverlappingZones([])).toEqual([])
    expect(findOverlappingZones([zone(1, 0, 0, 10, 10)])).toEqual([])
    expect(findOverlappingZones([zone(1, 0, 0, 10, 10), zone(2, 20, 0, 10, 10), zone(3, 0, 20, 10, 10)])).toEqual([])
  })

  it('does not count zones that only share an edge or a corner', () => {
    expect(findOverlappingZones([zone(1, 0, 0, 10, 10), zone(2, 10, 0, 10, 10), zone(3, 10, 10, 10, 10)])).toEqual([])
  })

  it('reports each overlapping pair once, including a zone inside another', () => {
    const a = zone(1, 0, 0, 100, 100)
    const b = zone(2, 50, 50, 100, 100)
    const c = zone(3, 10, 10, 5, 5)
    const far = zone(4, 500, 500, 10, 10)

    expect(findOverlappingZones([a, b, c, far])).toEqual([[a, b], [a, c]])
  })
})

describe('the real map', () => {
  const map = JSON.parse(readFileSync(new URL('../assets/maps/welcome/map.tmj', import.meta.url), 'utf-8')) as { layers: { name: string, objects?: TiledSpaceObject[] }[] }
  const zones = resolvePrivateZones(map.layers.find(layer => layer.name === 'spaces')?.objects ?? [])

  it('has private zones to check', () => {
    expect(zones.length).toBeGreaterThan(0)
  })

  it('has no two private zones that overlap (privateZoneAt would pick one silently)', () => {
    const overlapping = findOverlappingZones(zones).map(([a, b]) => `${a.name} (#${a.id}) overlaps ${b.name} (#${b.id})`)

    expect(overlapping).toEqual([])
  })
})
