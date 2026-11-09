import { applyDeviceChoice } from '$lib/av/devices/room-device-options'
import { describe, expect, it } from 'vitest'

interface Defaults { deviceId?: string, echoCancellation?: boolean }
const roomWith = (options: { audioCaptureDefaults?: Defaults, videoCaptureDefaults?: Defaults } = {}) => ({ options } as unknown as Parameters<typeof applyDeviceChoice>[0])

describe('applyDeviceChoice (issue #245)', () => {
  it('points the room\'s next capture at the chosen microphone and camera', () => {
    const room = roomWith()

    applyDeviceChoice(room, { audioinput: 'mic-2', videoinput: 'cam-9' })

    expect(room.options.audioCaptureDefaults).toEqual({ deviceId: 'mic-2' })
    expect(room.options.videoCaptureDefaults).toEqual({ deviceId: 'cam-9' })
  })

  it('keeps the other capture defaults the room already has', () => {
    const room = roomWith({ audioCaptureDefaults: { echoCancellation: true, deviceId: 'old' } })

    applyDeviceChoice(room, { audioinput: 'mic-2' })

    expect(room.options.audioCaptureDefaults).toEqual({ echoCancellation: true, deviceId: 'mic-2' })
  })

  it('leaves a kind alone when nothing was chosen for it, so the browser default stays', () => {
    const room = roomWith({ videoCaptureDefaults: { deviceId: 'default' } })

    applyDeviceChoice(room, { audioinput: 'mic-2' })

    expect(room.options.videoCaptureDefaults).toEqual({ deviceId: 'default' })
  })

  it('does nothing for an empty choice', () => {
    const room = roomWith()

    applyDeviceChoice(room, {})

    expect(room.options).toEqual({})
  })
})
