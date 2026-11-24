import { listDevices, watchDevices } from '$lib/av/devices/device-list'
import { Room } from 'livekit-client'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('livekit-client', () => ({
  Room: { getLocalDevices: vi.fn(async () => [{ kind: 'audioinput', deviceId: 'mic-1', label: 'Headset', groupId: 'g' }]) },
}))

describe('listDevices (issue #282)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('is empty when the browser has no media devices at all', async () => {
    vi.stubGlobal('navigator', {})

    await expect(listDevices('audioinput')).resolves.toEqual([])
    expect(Room.getLocalDevices).not.toHaveBeenCalled()
  })

  it('lists the devices of the kind, without asking for permission', async () => {
    vi.stubGlobal('navigator', { mediaDevices: {} })

    await expect(listDevices('audioinput')).resolves.toEqual([{ deviceId: 'mic-1', label: 'Headset' }])
    expect(Room.getLocalDevices).toHaveBeenCalledWith('audioinput', false)
  })
})

describe('watchDevices (issue #282)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('listens for devicechange and stops when asked', () => {
    const mediaDevices = { addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('navigator', { mediaDevices })
    const onChange = vi.fn()

    const stop = watchDevices(onChange)
    expect(mediaDevices.addEventListener).toHaveBeenCalledWith('devicechange', onChange)
    stop()

    expect(mediaDevices.removeEventListener).toHaveBeenCalledWith('devicechange', onChange)
  })

  it('does nothing, and does not throw, when the browser has no media devices', () => {
    vi.stubGlobal('navigator', {})

    expect(() => watchDevices(vi.fn())()).not.toThrow()
  })
})
