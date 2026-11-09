import { PendingTileTimeout } from '$lib/av/pending-tile-timeout'
import { describe, expect, it } from 'vitest'

describe('pendingTileTimeout (issue #225)', () => {
  it('keeps a pending person visible until the timeout elapses', () => {
    const timeout = new PendingTileTimeout(15_000)

    expect([...timeout.visible(['a'], 0)]).toEqual(['a'])
    expect([...timeout.visible(['a'], 14_999)]).toEqual(['a'])
    expect([...timeout.visible(['a'], 15_000)]).toEqual([])
  })

  it('keeps hiding a person after the timeout while they stay pending', () => {
    const timeout = new PendingTileTimeout(15_000)
    timeout.visible(['a'], 0)

    expect([...timeout.visible(['a'], 20_000)]).toEqual([])
    expect([...timeout.visible(['a'], 60_000)]).toEqual([])
  })

  it('times each person from when they first became pending', () => {
    const timeout = new PendingTileTimeout(15_000)
    timeout.visible(['a'], 0)

    expect([...timeout.visible(['a', 'b'], 10_000)].sort()).toEqual(['a', 'b'])
    expect([...timeout.visible(['a', 'b'], 16_000)]).toEqual(['b'])
  })

  it('starts the clock over when the person stops being pending and becomes pending again', () => {
    const timeout = new PendingTileTimeout(15_000)
    timeout.visible(['a'], 0)
    expect([...timeout.visible(['a'], 16_000)]).toEqual([])

    // Connected (no longer pending) or left the zone, then back to pending.
    timeout.visible([], 17_000)
    expect([...timeout.visible(['a'], 18_000)]).toEqual(['a'])
    expect([...timeout.visible(['a'], 32_999)]).toEqual(['a'])
    expect([...timeout.visible(['a'], 33_000)]).toEqual([])
  })

  it('returns nothing for nobody pending', () => {
    expect([...new PendingTileTimeout().visible([], 0)]).toEqual([])
  })

  it('defaults to 15 seconds', () => {
    const timeout = new PendingTileTimeout()
    timeout.visible(['a'], 0)

    expect([...timeout.visible(['a'], 14_999)]).toEqual(['a'])
    expect([...timeout.visible(['a'], 15_000)]).toEqual([])
  })
})
