import { busyProximityVolume } from '$lib/av/busy-proximity-volume'
import { proximityVolume } from '$lib/av/proximity-volume'
import { describe, expect, it } from 'vitest'

const RANGE = 200

describe('busyProximityVolume', () => {
  it('is 0 at distance 0 when local is busy', () => {
    expect(busyProximityVolume(0, RANGE, 'busy', 'available')).toBe(0)
  })

  it('is 0 at distance 0 when remote is busy', () => {
    expect(busyProximityVolume(0, RANGE, 'available', 'busy')).toBe(0)
  })

  it('is 0 when both are busy', () => {
    expect(busyProximityVolume(0, RANGE, 'busy', 'busy')).toBe(0)
  })

  it('matches proximityVolume when both are available at 0, mid-range, and beyond range', () => {
    expect(busyProximityVolume(0, RANGE, 'available', 'available')).toBe(proximityVolume(0, RANGE))
    expect(busyProximityVolume(RANGE / 2, RANGE, 'available', 'available')).toBe(
      proximityVolume(RANGE / 2, RANGE),
    )
    expect(busyProximityVolume(RANGE, RANGE, 'available', 'available')).toBe(
      proximityVolume(RANGE, RANGE),
    )
    expect(busyProximityVolume(RANGE + 50, RANGE, 'available', 'available')).toBe(
      proximityVolume(RANGE + 50, RANGE),
    )
  })
})
