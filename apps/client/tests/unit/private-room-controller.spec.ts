import type { AvatarPosition, ProximityAudioControllerOptions } from '$lib/av/proximity-audio-controller'
import type { PrivateZone } from '@kangeikai/shared'
import { fetchLiveKitToken } from '$lib/av/livekit-token-client'
import { PrivateRoomController } from '$lib/av/private-room-controller'
import { afterEach, describe, expect, it, vi } from 'vitest'

const events: string[] = []
// What the fake local participant reports; `disconnect()` flips both to false, like a real
// livekit-client Room, which stops and unpublishes the local tracks.
const localMedia = { microphone: true, camera: false }

vi.mock('livekit-client', () => {
  class FakeRoom {
    localParticipant = {
      get isMicrophoneEnabled() { return localMedia.microphone },
      get isCameraEnabled() { return localMedia.camera },
    }

    connect = vi.fn(async () => {})
    disconnect = vi.fn(async () => {
      localMedia.microphone = false
      localMedia.camera = false
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

/** Makes the next `times` token requests reject (one-shot, so nothing leaks into later tests). */
function failFetch(times: number) {
  for (let i = 0; i < times; i++) {
    vi.mocked(fetchLiveKitToken).mockRejectedValueOnce(new Error('network down'))
  }
}

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
    localMedia.microphone = true
    localMedia.camera = false
    vi.clearAllMocks()
  })

  it('waits for room.disconnect() to resolve before calling onDisconnect (issue #137)', async () => {
    const controller = new PrivateRoomController('http://fake/livekit-token')
    controller.setZones(zones)
    const onConnect = vi.fn()
    const onDisconnect = vi.fn(() => events.push('onDisconnect called'))
    const onError = vi.fn()
    const noop = () => {}

    // A remote occupant joins the zone alongside the local avatar — establishes the private room.
    await controller.update(options, pos(50, 50), new Map([['remote-1', pos(60, 60)]]), { onConnect, onDisconnect, onError }, noop)
    expect(controller.connectedZoneId).toBe(1)

    // The remote occupant leaves the zone — occupancy drops back under 2, tearing the room down.
    await controller.update(options, pos(50, 50), new Map(), { onConnect, onDisconnect, onError }, noop)

    expect(events).toEqual(['room.disconnect resolved', 'onDisconnect called'])
    expect(onDisconnect).toHaveBeenCalledTimes(1)
    expect(controller.connectedZoneId).toBeNull()
  })
})

describe('privateRoomController connection failure (issue #142)', () => {
  afterEach(() => {
    events.length = 0
    vi.clearAllMocks()
  })

  function handlers() {
    return { onConnect: vi.fn(), onDisconnect: vi.fn(), onError: vi.fn() }
  }

  it('calls onError and stays disconnected when every connection attempt fails', async () => {
    failFetch(3)
    const controller = new PrivateRoomController('http://fake/livekit-token', 0)
    controller.setZones(zones)
    const h = handlers()

    await controller.update(options, pos(50, 50), new Map([['remote-1', pos(60, 60)]]), h, () => {})

    expect(h.onError).toHaveBeenCalledExactlyOnceWith(1)
    expect(h.onConnect).not.toHaveBeenCalled()
    expect(controller.connectedZoneId).toBeNull()
  })

  it('does not retry on the next frame while still in the zone that just failed (bounded retry, not per-frame)', async () => {
    failFetch(3)
    const controller = new PrivateRoomController('http://fake/livekit-token', 0)
    controller.setZones(zones)
    const h = handlers()
    const remotePositions = new Map([['remote-1', pos(60, 60)]])

    await controller.update(options, pos(50, 50), remotePositions, h, () => {})
    expect(h.onError).toHaveBeenCalledTimes(1)

    // Same zone, same occupancy, next frame.
    await controller.update(options, pos(50, 50), remotePositions, h, () => {})

    expect(fetchLiveKitToken).toHaveBeenCalledTimes(3)
    expect(h.onError).toHaveBeenCalledTimes(1)
  })

  it('retries after leaving and re-entering the zone (a fresh threshold crossing)', async () => {
    failFetch(3)
    const controller = new PrivateRoomController('http://fake/livekit-token', 0)
    controller.setZones(zones)
    const h = handlers()
    const remotePositions = new Map([['remote-1', pos(60, 60)]])

    await controller.update(options, pos(50, 50), remotePositions, h, () => {})
    expect(h.onError).toHaveBeenCalledTimes(1)

    // Leaves the zone entirely (outside every zone's bounds).
    await controller.update(options, pos(500, 500), remotePositions, h, () => {})

    // Re-enters — fetchLiveKitToken now resolves normally (the mocked rejection was one-time).
    await controller.update(options, pos(50, 50), remotePositions, h, () => {})

    expect(fetchLiveKitToken).toHaveBeenCalledTimes(4)
    expect(h.onConnect).toHaveBeenCalledOnce()
    expect(controller.connectedZoneId).toBe(1)
  })
})

describe('privateRoomController bounded retry and manual retry (issue #225)', () => {
  afterEach(() => {
    events.length = 0
    vi.clearAllMocks()
  })

  const remoteInZone = new Map([['remote-1', pos(60, 60)]])

  function handlers() {
    return { onConnect: vi.fn(), onDisconnect: vi.fn(), onError: vi.fn() }
  }

  it('connects without reporting an error when a transient failure is followed by a success', async () => {
    failFetch(1)
    const controller = new PrivateRoomController('http://fake/livekit-token', 0)
    controller.setZones(zones)
    const h = handlers()

    await controller.update(options, pos(50, 50), remoteInZone, h, () => {})

    expect(fetchLiveKitToken).toHaveBeenCalledTimes(2)
    expect(h.onError).not.toHaveBeenCalled()
    expect(h.onConnect).toHaveBeenCalledOnce()
    expect(controller.connectedZoneId).toBe(1)
  })

  it('reports one error after 1 attempt plus 2 retries all fail', async () => {
    failFetch(3)
    const controller = new PrivateRoomController('http://fake/livekit-token', 0)
    controller.setZones(zones)
    const h = handlers()

    await controller.update(options, pos(50, 50), remoteInZone, h, () => {})

    expect(fetchLiveKitToken).toHaveBeenCalledTimes(3)
    expect(h.onError).toHaveBeenCalledExactlyOnceWith(1)
    expect(h.onConnect).not.toHaveBeenCalled()
  })

  it('flushes the local position before every attempt, retries included', async () => {
    failFetch(2)
    const controller = new PrivateRoomController('http://fake/livekit-token', 0)
    controller.setZones(zones)
    const flush = vi.fn()

    await controller.update(options, pos(50, 50), remoteInZone, handlers(), flush)

    expect(flush).toHaveBeenCalledTimes(3)
  })

  it('waits the retry delay between attempts', async () => {
    vi.useFakeTimers()
    try {
      failFetch(1)
      const controller = new PrivateRoomController('http://fake/livekit-token', 1000)
      controller.setZones(zones)
      const h = handlers()

      const pending = controller.update(options, pos(50, 50), remoteInZone, h, () => {})
      await vi.advanceTimersByTimeAsync(999)
      expect(fetchLiveKitToken).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1)
      await pending
      expect(fetchLiveKitToken).toHaveBeenCalledTimes(2)
      expect(h.onConnect).toHaveBeenCalledOnce()
    }
    finally {
      vi.useRealTimers()
    }
  })

  it('retryFailedConnection() lets the next frame try again in the same zone', async () => {
    failFetch(3)
    const controller = new PrivateRoomController('http://fake/livekit-token', 0)
    controller.setZones(zones)
    const h = handlers()
    await controller.update(options, pos(50, 50), remoteInZone, h, () => {})
    expect(h.onError).toHaveBeenCalledOnce()

    controller.retryFailedConnection()
    await controller.update(options, pos(50, 50), remoteInZone, h, () => {})

    expect(h.onConnect).toHaveBeenCalledOnce()
    expect(controller.connectedZoneId).toBe(1)
  })
})

describe('privateRoomController media state hand-off on leave (issue #222)', () => {
  afterEach(() => {
    events.length = 0
    localMedia.microphone = true
    localMedia.camera = false
    vi.clearAllMocks()
  })

  const remoteInZone = new Map([['remote-1', pos(60, 60)]])

  async function leaveZone(media: { microphone: boolean, camera: boolean }) {
    const controller = new PrivateRoomController('http://fake/livekit-token')
    controller.setZones(zones)
    const h = { onConnect: vi.fn(), onDisconnect: vi.fn(), onError: vi.fn() }
    await controller.update(options, pos(50, 50), remoteInZone, h, () => {})
    localMedia.microphone = media.microphone
    localMedia.camera = media.camera
    await controller.update(options, pos(50, 50), new Map(), h, () => {})
    return h
  }

  it.each([
    { microphone: true, camera: false },
    { microphone: true, camera: true },
    { microphone: false, camera: false },
    { microphone: false, camera: true },
  ])('hands onDisconnect the pre-disconnect state %j', async (media) => {
    const h = await leaveZone(media)

    expect(h.onDisconnect).toHaveBeenCalledExactlyOnceWith({ microphoneEnabled: media.microphone, cameraEnabled: media.camera })
  })

  it('hands over the state when switching straight into a different private zone', async () => {
    const twoZones: PrivateZone[] = [...zones, { id: 2, name: 'desk-02', x: 300, y: 0, width: 100, height: 100 }]
    const controller = new PrivateRoomController('http://fake/livekit-token')
    controller.setZones(twoZones)
    const h = { onConnect: vi.fn(), onDisconnect: vi.fn(), onError: vi.fn() }
    await controller.update(options, pos(50, 50), remoteInZone, h, () => {})

    await controller.update(options, pos(350, 50), new Map([['remote-2', pos(360, 60)]]), h, () => {})

    expect(h.onDisconnect).toHaveBeenCalledExactlyOnceWith({ microphoneEnabled: true, cameraEnabled: false })
  })
})
