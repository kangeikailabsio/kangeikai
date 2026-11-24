import type { Room } from 'livekit-client'
import { connectRoom, ROOM_CONNECT_TIMEOUT_MS } from '$lib/av/connect-room'
import { afterEach, describe, expect, it, vi } from 'vitest'

function fakeRoom(connect: () => Promise<void>, disconnect: () => Promise<void> = async () => {}) {
  return { connect: vi.fn(connect), disconnect: vi.fn(disconnect) }
}

describe('connectRoom (issue #277)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves when the room connects in time, without disconnecting it', async () => {
    const room = fakeRoom(async () => {})

    await connectRoom(room as unknown as Room, 'wss://fake', 'token')

    expect(room.connect).toHaveBeenCalledWith('wss://fake', 'token')
    expect(room.disconnect).not.toHaveBeenCalled()
  })

  it('rejects with the original error and leaves the room alone when connect fails by itself', async () => {
    const room = fakeRoom(async () => {
      throw new Error('refused')
    })

    await expect(connectRoom(room as unknown as Room, 'wss://fake', 'token')).rejects.toThrow('refused')
    expect(room.disconnect).not.toHaveBeenCalled()
  })

  it('rejects and disconnects the room when connect never settles', async () => {
    vi.useFakeTimers()
    const room = fakeRoom(() => new Promise<void>(() => {}))

    const assertion = expect(connectRoom(room as unknown as Room, 'wss://fake', 'token')).rejects.toThrow(`${ROOM_CONNECT_TIMEOUT_MS} ms`)
    await vi.advanceTimersByTimeAsync(ROOM_CONNECT_TIMEOUT_MS - 1)
    expect(room.disconnect).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    await assertion
    expect(room.disconnect).toHaveBeenCalledTimes(1)
  })

  it('still reports the timeout when disconnecting the timed-out room also fails', async () => {
    vi.useFakeTimers()
    const room = fakeRoom(() => new Promise<void>(() => {}), async () => {
      throw new Error('already gone')
    })

    const assertion = expect(connectRoom(room as unknown as Room, 'wss://fake', 'token', 50)).rejects.toThrow('50 ms')
    await vi.advanceTimersByTimeAsync(50)

    await assertion
  })
})
