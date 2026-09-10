import { resolveProximityHysteresis } from '$lib/av/proximity-hysteresis'
import { describe, expect, it } from 'vitest'

describe('resolveProximityHysteresis', () => {
  it('becomes nearby once inside the enter range, when not already nearby', () => {
    expect(resolveProximityHysteresis(79, false, 80, 100)).toBe(true)
    expect(resolveProximityHysteresis(80, false, 80, 100)).toBe(false)
    expect(resolveProximityHysteresis(90, false, 80, 100)).toBe(false)
  })

  it('stays nearby past the enter range, up to the wider stay range', () => {
    expect(resolveProximityHysteresis(90, true, 80, 100)).toBe(true)
    expect(resolveProximityHysteresis(99, true, 80, 100)).toBe(true)
  })

  it('only drops out once past the stay range', () => {
    expect(resolveProximityHysteresis(100, true, 80, 100)).toBe(false)
    expect(resolveProximityHysteresis(150, true, 80, 100)).toBe(false)
  })

  it('does not flicker for small back-and-forth movement between the two thresholds', () => {
    // Simulates hovering at 85px, right at what used to be a single hard cutoff sitting inside
    // this window — once in, small jitter around 85 should never flip back out.
    let wasNearby = resolveProximityHysteresis(75, false, 80, 100)
    expect(wasNearby).toBe(true)

    for (const distance of [85, 90, 84, 92, 88]) {
      wasNearby = resolveProximityHysteresis(distance, wasNearby, 80, 100)
      expect(wasNearby).toBe(true)
    }
  })
})
