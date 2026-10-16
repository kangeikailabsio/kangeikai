import { nextOverlayRefresh, VIDEO_OVERLAY_THROTTLE_MS } from '$lib/game/games/game-input'
import { describe, expect, it } from 'vitest'

describe('nextOverlayRefresh', () => {
  it('always refreshes while unthrottled', () => {
    for (const now of [0, 16, 32, 1000])
      expect(nextOverlayRefresh(now, 0, false)).toEqual({ refresh: true, dueAt: 0 })
  })

  it('clears the due time while unthrottled so closing an overlay refreshes immediately', () => {
    expect(nextOverlayRefresh(1000, 5000, false).dueAt).toBe(0)
    // The frame right after the overlay closes refreshes even though the old due time is in future.
    expect(nextOverlayRefresh(1016, 0, false).refresh).toBe(true)
  })

  it('refreshes on the first throttled frame, then at most once per interval', () => {
    const first = nextOverlayRefresh(1000, 0, true)
    expect(first.refresh).toBe(true)
    expect(first.dueAt).toBe(1000 + VIDEO_OVERLAY_THROTTLE_MS)

    let dueAt = first.dueAt
    let refreshes = 0
    // Six interval's worth of 60fps frames should refresh about six times, not 360.
    for (let frame = 1; frame <= 6 * VIDEO_OVERLAY_THROTTLE_MS / 16; frame++) {
      const result = nextOverlayRefresh(1000 + frame * 16, dueAt, true)
      dueAt = result.dueAt
      if (result.refresh)
        refreshes++
    }
    expect(refreshes).toBeLessThanOrEqual(6)
    expect(refreshes).toBeGreaterThanOrEqual(5)
  })

  it('does not refresh before the interval has elapsed', () => {
    expect(nextOverlayRefresh(1050, 1100, true)).toEqual({ refresh: false, dueAt: 1100 })
    expect(nextOverlayRefresh(1100, 1100, true).refresh).toBe(true)
  })

  it('honours a custom interval', () => {
    expect(nextOverlayRefresh(0, 0, true, 500).dueAt).toBe(500)
    expect(nextOverlayRefresh(499, 500, true, 500).refresh).toBe(false)
  })
})
