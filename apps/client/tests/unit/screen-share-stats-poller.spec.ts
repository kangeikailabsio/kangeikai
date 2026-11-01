import type { PollableTile } from '$lib/av/screen-share-stats-poller'
import { startScreenShareStatsPolling } from '$lib/av/screen-share-stats-poller'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function receiverReport(bytes: number, timestamp: number) {
  return new Map([['i', { id: 'i', type: 'inbound-rtp', kind: 'video', timestamp, bytesReceived: bytes, packetsLost: 0, packetsReceived: 10 }]])
}

function remoteTile(sessionId: string, getStats: () => Promise<unknown>): PollableTile {
  return { sessionId, isLocal: false, videoTrack: { receiver: { getStats } } as never }
}

describe('startScreenShareStatsPolling', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not read the tile list synchronously on start (it would be tracked by the caller\'s $effect)', async () => {
    const getTiles = vi.fn(() => [] as PollableTile[])
    const stop = startScreenShareStatsPolling(getTiles, vi.fn(), 2000)

    expect(getTiles).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(0)
    expect(getTiles).toHaveBeenCalledTimes(1)
    stop()
  })

  it('publishes stats per sessionId, with a bitrate from the second sample on', async () => {
    let bytes = 0
    let time = 1000
    const tile = remoteTile('a', async () => receiverReport((bytes += 250_000), (time += 2000)))
    const publish = vi.fn()
    const stop = startScreenShareStatsPolling(() => [tile], publish, 2000)

    await vi.advanceTimersByTimeAsync(0)
    expect(publish).toHaveBeenLastCalledWith({ a: expect.objectContaining({ level: 'checking' }) })

    await vi.advanceTimersByTimeAsync(2000)
    expect(publish.mock.lastCall?.[0].a.bitrateKbps).toBeCloseTo(1000)
    stop()
  })

  it('drops tiles that disappeared and stops polling after stop()', async () => {
    const tiles = [remoteTile('a', async () => receiverReport(0, 1)), remoteTile('b', async () => receiverReport(0, 1))]
    const publish = vi.fn()
    const stop = startScreenShareStatsPolling(() => tiles, publish, 2000)
    await vi.advanceTimersByTimeAsync(0)
    expect(Object.keys(publish.mock.lastCall?.[0])).toEqual(['a', 'b'])

    tiles.pop()
    await vi.advanceTimersByTimeAsync(2000)
    expect(Object.keys(publish.mock.lastCall?.[0])).toEqual(['a'])

    stop()
    const calls = publish.mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(publish.mock.calls.length).toBe(calls)
  })

  it('skips tiles without a receiver/sender yet and survives a failing getStats', async () => {
    const noReceiver: PollableTile = { sessionId: 'x', isLocal: false, videoTrack: {} as never }
    const failing = remoteTile('y', async () => Promise.reject(new Error('closed')))
    const publish = vi.fn()
    const stop = startScreenShareStatsPolling(() => [noReceiver, failing], publish, 2000)

    await vi.advanceTimersByTimeAsync(0)
    expect(publish).toHaveBeenCalledWith({})
    stop()
  })

  it('resets the tracker when the tile gets a new track (room hand-off)', async () => {
    const first = remoteTile('a', async () => receiverReport(1_000_000, 1000))
    let current = first
    const publish = vi.fn()
    const stop = startScreenShareStatsPolling(() => [current], publish, 2000)
    await vi.advanceTimersByTimeAsync(0)

    current = remoteTile('a', async () => receiverReport(5, 3000))
    await vi.advanceTimersByTimeAsync(2000)
    expect(publish.mock.lastCall?.[0].a.level).toBe('checking')
    stop()
  })
})
