import type { AvatarPosition } from '$lib/av/proximity-audio-controller'
import type { PrivateZone } from '$lib/game/map/private-zones'
import { resolvePrivateZoneOccupancy } from '$lib/av/private-room-occupancy'
import { describe, expect, it } from 'vitest'

const zones: PrivateZone[] = [
  { id: 1, name: 'desk-01', x: 0, y: 0, width: 100, height: 100 },
  { id: 2, name: 'meeting-room', x: 200, y: 0, width: 100, height: 100 },
]

function positions(entries: [string, AvatarPosition][]): ReadonlyMap<string, AvatarPosition> {
  return new Map(entries)
}

describe('resolvePrivateZoneOccupancy', () => {
  it('returns no zone and no occupants when the local avatar is outside every zone', () => {
    expect(resolvePrivateZoneOccupancy(zones, { x: 150, y: 50 }, positions([]))).toEqual({
      zoneId: null,
      occupantSessionIds: [],
    })
  })

  it('returns the zone with no occupants when alone in it', () => {
    expect(resolvePrivateZoneOccupancy(zones, { x: 50, y: 50 }, positions([['remote-1', { x: 250, y: 50 }]]))).toEqual({
      zoneId: 1,
      occupantSessionIds: [],
    })
  })

  it('lists remote avatars sharing the same zone', () => {
    const remotePositions = positions([
      ['remote-1', { x: 60, y: 60 }],
      ['remote-2', { x: 250, y: 50 }],
    ])
    expect(resolvePrivateZoneOccupancy(zones, { x: 50, y: 50 }, remotePositions)).toEqual({
      zoneId: 1,
      occupantSessionIds: ['remote-1'],
    })
  })

  it('excludes remote avatars in a different zone', () => {
    const remotePositions = positions([['remote-1', { x: 250, y: 50 }]])
    expect(resolvePrivateZoneOccupancy(zones, { x: 50, y: 50 }, remotePositions)).toEqual({
      zoneId: 1,
      occupantSessionIds: [],
    })
  })

  it('excludes remote avatars outside every zone', () => {
    const remotePositions = positions([['remote-1', { x: 150, y: 50 }]])
    expect(resolvePrivateZoneOccupancy(zones, { x: 50, y: 50 }, remotePositions)).toEqual({
      zoneId: 1,
      occupantSessionIds: [],
    })
  })
})
