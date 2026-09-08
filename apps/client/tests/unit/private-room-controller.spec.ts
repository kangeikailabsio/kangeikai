import type { AvatarPosition, ProximityAudioControllerOptions } from '$lib/av/proximity-audio-controller'
import type { PrivateZone } from '@kangeikai/shared'
import { PrivateRoomController } from '$lib/av/private-room-controller'
import { afterEach, describe, expect, it, vi } from 'vitest'

const events: string[] = []

vi.mock('livekit-client', () => {
  class FakeRoom {
    connect = vi.fn(async () => {})
    disconnect = vi.fn(async () => {
      // A real Room.disconnect() only resolves once its local tracks (mic/camera) are actually
      // stopped — a microtask delay here stands in for that, so a test relying on call order
      // alone (rather than resolution order) would pass for the wrong reason.
      await Promise.resolve()
      events.push('room.disconnect resolved')
    })
  }
  return { Room: FakeRoom }
})

vi.mock('$lib/av/livekit-token-client', () => ({
  fetchLiveKitToken: vi.fn(async () => ({ token: 'fake-token', url: 'wss://fake' })),
}))

vi.mock('$lib/av/attach-remote-audio', () => ({
  attachRemoteAudioElements: vi.fn(),
}))

const zones: PrivateZone[] = [
  { id: 1, name: 'desk-01', x: 0, y: 0, width: 100, height: 100 },
]

const options: ProximityAudioControllerOptions = { identity: 'me', name: 'Me', proof: 'proof' }

function pos(x: number, y: number, presence: AvatarPosition['presence'] = 'available'): AvatarPosition {
  return { x, y, presence }
}

describe('privateRoomController teardown ordering', () => {
  afterEach(() => {
    events.length = 0
    vi.clearAllMocks()
  })

  it('waits for room.disconnect() to resolve before calling onDisconnect (issue #137)', async () => {
    const controller = new PrivateRoomController('http://fake/livekit-token')
    controller.setZones(zones)
    const onConnect = vi.fn()
    const onDisconnect = vi.fn(() => events.push('onDisconnect called'))
    const noop = () => {}

    // A remote occupant joins the zone alongside the local avatar — establishes the private room.
    await controller.update(options, pos(50, 50), new Map([['remote-1', pos(60, 60)]]), { onConnect, onDisconnect }, noop)
    expect(controller.connectedZoneId).toBe(1)

    // The remote occupant leaves the zone — occupancy drops back under 2, tearing the room down.
    await controller.update(options, pos(50, 50), new Map(), { onConnect, onDisconnect }, noop)

    expect(events).toEqual(['room.disconnect resolved', 'onDisconnect called'])
    expect(onDisconnect).toHaveBeenCalledTimes(1)
    expect(controller.connectedZoneId).toBeNull()
  })
})
