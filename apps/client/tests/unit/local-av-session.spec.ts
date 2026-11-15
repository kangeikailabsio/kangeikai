import type { AvatarPosition } from '$lib/av/proximity-audio-controller'
import type { Room } from 'livekit-client'
import { fetchLiveKitToken } from '$lib/av/livekit-token-client'
import { LocalAvSession } from '$lib/av/local-av-session'
import { PrivateRoomController } from '$lib/av/private-room-controller'
import { ProximityAudioController } from '$lib/av/proximity-audio-controller'
import { ParticipantEvent, Track } from 'livekit-client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** Everything the scenarios want to see in order: the sequence across rooms is the point. */
const log: string[] = []

vi.mock('$lib/av/livekit-token-client', () => ({
  fetchLiveKitToken: vi.fn(async (_endpoint: string, options: { room?: string }) => {
    log.push(`token ${options.room ?? 'office'}`)
    return { token: 'fake-token', url: 'wss://fake' }
  }),
}))

vi.mock('$lib/av/attach-remote-audio', () => ({
  attachRemoteAudioElements: vi.fn(),
}))

/** A promise the test settles by hand, to hold a step of the switch in flight. */
function deferred<T = void>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** The part of a LiveKit local participant `MediaControls` touches, recording what happens to it. */
function fakeParticipant(name: string) {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const publications = new Map<Track.Source, { track: unknown }>()
  const participant = {
    isMicrophoneEnabled: false,
    isCameraEnabled: false,
    isScreenShareEnabled: false,
    connectionQuality: 'excellent',
    publications,
    setMicrophoneEnabled: vi.fn(async (enabled: boolean) => {
      log.push(`${name} mic ${enabled}`)
    }),
    setCameraEnabled: vi.fn(async (enabled: boolean) => {
      log.push(`${name} camera ${enabled}`)
    }),
    setScreenShareEnabled: vi.fn(async (enabled: boolean) => {
      log.push(`${name} screenshare ${enabled}`)
    }),
    getTrackPublication: vi.fn((source: Track.Source) => publications.get(source)),
    unpublishTrack: vi.fn(async () => {
      log.push(`${name} unpublish track`)
    }),
    publishTrack: vi.fn(async () => {
      log.push(`${name} publish track`)
    }),
    on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      listeners.set(event, [...(listeners.get(event) ?? []), callback])
    }),
    off: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      listeners.set(event, (listeners.get(event) ?? []).filter(existing => existing !== callback))
    }),
    /** What LiveKit does: only the listeners still attached hear it. */
    emit(event: string, ...args: unknown[]) {
      for (const callback of listeners.get(event) ?? [])
        callback(...args)
    },
  }
  return participant
}

function fakeRoom(name: string) {
  const localParticipant = fakeParticipant(name)
  const room = {
    options: {},
    remoteParticipants: new Map<string, unknown>(),
    localParticipant,
    connect: vi.fn(async () => {
      log.push(`${name} connect`)
    }),
    // A real disconnect resolves only once the local tracks are stopped: a microtask stands in for it.
    disconnect: vi.fn(async () => {
      await Promise.resolve()
      log.push(`${name} disconnect resolved`)
    }),
  }
  return room as unknown as Room & typeof room
}

const zones = [{ id: 1, name: 'desk-01', x: 0, y: 0, width: 100, height: 100 }]
const inZone: AvatarPosition = { x: 50, y: 50, presence: 'available' }
const outside: AvatarPosition = { x: 500, y: 500, presence: 'available' }
const withNeighbour = new Map<string, AvatarPosition>([['remote-1', { x: 60, y: 60, presence: 'available' }]])
const alone = new Map<string, AvatarPosition>()

function setup(options: { presence?: 'available' | 'busy', onPrivateRoomBuilt?: (room: ReturnType<typeof fakeRoom>) => void } = {}) {
  const officeRoom = fakeRoom('office')
  const privateRoomsBuilt: Array<ReturnType<typeof fakeRoom>> = []
  const events = {
    onMediaReady: vi.fn(),
    onPresenceApplied: vi.fn(),
    onScreenShareEnded: vi.fn(),
    onConnectionQualityChanged: vi.fn(),
    onScreenShareHandoffFailed: vi.fn(),
    onPrivateRoomConnect: vi.fn(),
  }
  const state = { presence: options.presence ?? 'available' as 'available' | 'busy' }
  const flushPosition = vi.fn(() => {
    log.push('flush position')
  })
  const session = new LocalAvSession({
    identity: () => ({ identity: 'me', name: 'Me', proof: 'proof' }),
    getPresence: () => state.presence,
    flushPosition,
    events,
    office: new ProximityAudioController('http://fake/token', () => ({}), () => officeRoom),
    privateRooms: new PrivateRoomController('http://fake/token', 0, () => ({}), () => {
      const room = fakeRoom(`private${privateRoomsBuilt.length + 1}`)
      privateRoomsBuilt.push(room)
      options.onPrivateRoomBuilt?.(room)
      return room
    }),
  })
  session.setZones(zones)
  return { session, officeRoom, privateRoomsBuilt, events, state, flushPosition }
}

/** Lets pending microtasks and the zero-delay timers of a connect settle. */
async function settle() {
  for (let i = 0; i < 10; i++)
    await new Promise(resolve => setTimeout(resolve, 0))
}

/** Runs one frame and waits for whatever it started. */
async function frame(session: LocalAvSession, position: AvatarPosition, remotes: ReadonlyMap<string, AvatarPosition>) {
  session.update(position, remotes)
  await settle()
}

beforeEach(() => {
  log.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('localAvSession joining the office', () => {
  it('connects the office and publishes the microphone and camera the person left on', async () => {
    const { session, officeRoom, events } = setup()

    session.connect({ microphoneEnabled: true, cameraEnabled: true })
    await settle()

    expect(log).toEqual(['token office', 'office connect', 'office mic true', 'office camera true', 'office screenshare false'])
    expect(session.media).toBeDefined()
    expect(events.onMediaReady).toHaveBeenCalledExactlyOnceWith(session.media)
    expect(events.onPresenceApplied).toHaveBeenCalledExactlyOnceWith('available')
    expect(session.activeRoom).toBe(officeRoom)
    expect(session.privateRoom).toBeNull()
  })

  it('does not connect before there is a realtime session to identify the person', async () => {
    const session = new LocalAvSession({
      identity: () => undefined,
      getPresence: () => 'available',
      flushPosition: vi.fn(),
      events: setup().events,
    })

    session.connect({ microphoneEnabled: true, cameraEnabled: false })
    await settle()

    expect(fetchLiveKitToken).not.toHaveBeenCalled()
  })

  it('joins Busy without publishing anything, and ending Busy restores what the person asked for', async () => {
    const { session, officeRoom, state } = setup({ presence: 'busy' })

    session.connect({ microphoneEnabled: true, cameraEnabled: true })
    await settle()
    expect(officeRoom.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(false)
    expect(session.media?.microphoneIntent).toBe(true)

    state.presence = 'available'
    await session.setBusy(false)

    expect(officeRoom.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(true)
    expect(officeRoom.localParticipant.setCameraEnabled).toHaveBeenLastCalledWith(true)
  })
})

describe('localAvSession office to private room', () => {
  it('asks for the token only after the position was sent (issue #134)', async () => {
    const { session } = setup()
    session.connect({ microphoneEnabled: false, cameraEnabled: false })
    await settle()
    log.length = 0

    await frame(session, inZone, withNeighbour)

    expect(log.indexOf('flush position')).toBeGreaterThanOrEqual(0)
    expect(log.indexOf('flush position')).toBeLessThan(log.indexOf('token private-1'))
  })

  it('moves the call to the private room, keeping the microphone and camera the person had', async () => {
    const { session, officeRoom, privateRoomsBuilt, events } = setup()
    session.connect({ microphoneEnabled: true, cameraEnabled: false })
    await settle()
    const media = session.media

    await frame(session, inZone, withNeighbour)

    const [privateRoom] = privateRoomsBuilt
    expect(session.privateRoom).toBe(privateRoom)
    expect(session.activeRoom).toBe(privateRoom)
    expect(officeRoom.disconnect).toHaveBeenCalledTimes(1)
    expect(privateRoom.localParticipant.setMicrophoneEnabled).toHaveBeenCalledExactlyOnceWith(true)
    expect(privateRoom.localParticipant.setCameraEnabled).toHaveBeenCalledExactlyOnceWith(false)
    expect(session.media).toBe(media)
    expect(events.onPrivateRoomConnect).toHaveBeenCalledTimes(1)
    expect(events.onMediaReady).toHaveBeenCalledTimes(2)
    expect(session.mediaConnecting).toBe(false)
  })

  it('reports the local media as connecting until the private room finished applying it (issue #141)', async () => {
    const micPublish = deferred()
    const { session, privateRoomsBuilt } = setup({
      onPrivateRoomBuilt: (room) => {
        room.localParticipant.setMicrophoneEnabled.mockImplementationOnce(() => micPublish.promise)
      },
    })
    session.connect({ microphoneEnabled: true, cameraEnabled: false })
    await settle()

    await frame(session, inZone, withNeighbour)
    expect(session.privateRoom).toBe(privateRoomsBuilt[0])
    expect(session.mediaConnecting).toBe(true)

    micPublish.resolve()
    await settle()
    expect(session.mediaConnecting).toBe(false)
  })

  it('keeps the person in the office view until the screen share is detached, then switches (pins today\'s order)', async () => {
    const { session, officeRoom, privateRoomsBuilt } = setup()
    session.connect({ microphoneEnabled: false, cameraEnabled: false })
    await settle()
    const shareTrack = { kind: 'video' }
    officeRoom.localParticipant.publications.set(Track.Source.ScreenShare, { track: shareTrack })
    const detach = deferred()
    officeRoom.localParticipant.unpublishTrack.mockImplementationOnce(() => detach.promise)

    session.update(inZone, withNeighbour)
    await vi.waitFor(() => expect(privateRoomsBuilt.length).toBe(1))
    await settle()

    expect(session.privateRoom).toBeNull()
    expect(officeRoom.disconnect).not.toHaveBeenCalled()

    detach.resolve()
    await settle()

    expect(session.privateRoom).toBe(privateRoomsBuilt[0])
    expect(officeRoom.disconnect).toHaveBeenCalledTimes(1)
  })

  it('hands an active screen share to the private room without capturing again (issue #116)', async () => {
    const { session, officeRoom, privateRoomsBuilt, events } = setup()
    session.connect({ microphoneEnabled: false, cameraEnabled: false })
    await settle()
    const shareTrack = { kind: 'video' }
    officeRoom.localParticipant.publications.set(Track.Source.ScreenShare, { track: shareTrack })
    log.length = 0

    await frame(session, inZone, withNeighbour)

    expect(officeRoom.localParticipant.unpublishTrack).toHaveBeenCalledWith(shareTrack, false)
    expect(privateRoomsBuilt[0].localParticipant.publishTrack).toHaveBeenCalledWith(shareTrack, expect.anything())
    expect(privateRoomsBuilt[0].localParticipant.setScreenShareEnabled).not.toHaveBeenCalled()
    expect(log.indexOf('office unpublish track')).toBeLessThan(log.indexOf('office disconnect resolved'))
    expect(events.onScreenShareHandoffFailed).not.toHaveBeenCalled()
  })

  it('tells the owner when the share could not be carried over, and still applies the microphone and camera', async () => {
    const { session, officeRoom, privateRoomsBuilt, events } = setup()
    session.connect({ microphoneEnabled: true, cameraEnabled: false })
    await settle()
    officeRoom.localParticipant.publications.set(Track.Source.ScreenShare, { track: { kind: 'video' } })
    const onMediaReady = events.onMediaReady
    onMediaReady.mockClear()
    session.update(inZone, withNeighbour)
    await vi.waitFor(() => expect(privateRoomsBuilt.length).toBe(1))
    privateRoomsBuilt[0].localParticipant.publishTrack.mockRejectedValueOnce(new Error('rejected'))
    await settle()

    expect(events.onScreenShareHandoffFailed).toHaveBeenCalledTimes(1)
    expect(privateRoomsBuilt[0].localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true)
    expect(onMediaReady).toHaveBeenCalledTimes(1)
  })

  it('applies Busy to the private room too: nothing is published until Busy ends', async () => {
    const { session, privateRoomsBuilt, state } = setup()
    session.connect({ microphoneEnabled: true, cameraEnabled: true })
    await settle()
    state.presence = 'busy'
    await session.setBusy(true)

    await frame(session, inZone, withNeighbour)

    const privateParticipant = privateRoomsBuilt[0].localParticipant
    expect(privateParticipant.setMicrophoneEnabled).toHaveBeenCalledExactlyOnceWith(false)
    state.presence = 'available'
    await session.setBusy(false)
    expect(privateParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(true)
    expect(privateParticipant.setCameraEnabled).toHaveBeenLastCalledWith(true)
  })
})

describe('localAvSession private room back to the office', () => {
  it('waits for the private room to finish disconnecting before the office captures again (issue #137)', async () => {
    const { session } = setup()
    session.connect({ microphoneEnabled: true, cameraEnabled: false })
    await settle()
    await frame(session, inZone, withNeighbour)
    log.length = 0

    await frame(session, inZone, alone)

    expect(log.indexOf('private1 disconnect resolved')).toBeGreaterThanOrEqual(0)
    expect(log.indexOf('private1 disconnect resolved')).toBeLessThan(log.indexOf('token office'))
    expect(log.indexOf('private1 disconnect resolved')).toBeLessThan(log.indexOf('office mic true'))
  })

  it('goes back to the office with the microphone and camera the person had in the call', async () => {
    const { session, officeRoom } = setup()
    session.connect({ microphoneEnabled: true, cameraEnabled: true })
    await settle()
    await frame(session, inZone, withNeighbour)
    await session.media?.setCameraEnabled(false)

    await frame(session, outside, alone)

    expect(session.privateRoom).toBeNull()
    expect(session.activeRoom).toBe(officeRoom)
    expect(officeRoom.localParticipant.setMicrophoneEnabled).toHaveBeenLastCalledWith(true)
    expect(officeRoom.localParticipant.setCameraEnabled).toHaveBeenLastCalledWith(false)
  })

  it('keeps the microphone on for someone who leaves right after joining, while its publish is still in flight (issue #239)', async () => {
    const micPublish = deferred()
    const { session, officeRoom } = setup({
      onPrivateRoomBuilt: (room) => {
        room.localParticipant.setMicrophoneEnabled.mockImplementationOnce(() => micPublish.promise)
      },
    })
    session.connect({ microphoneEnabled: true, cameraEnabled: false })
    await settle()
    await frame(session, inZone, withNeighbour)
    officeRoom.localParticipant.setMicrophoneEnabled.mockClear()

    // The microphone of the private room is still being published when the person walks out.
    await frame(session, outside, alone)

    expect(officeRoom.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(true)
    micPublish.resolve()
    await settle()
  })

  it('does not carry the screen share back: the office starts without one', async () => {
    const { session, officeRoom, privateRoomsBuilt } = setup()
    session.connect({ microphoneEnabled: false, cameraEnabled: false })
    await settle()
    officeRoom.localParticipant.publications.set(Track.Source.ScreenShare, { track: { kind: 'video' } })
    await frame(session, inZone, withNeighbour)
    officeRoom.localParticipant.publishTrack.mockClear()
    officeRoom.localParticipant.setScreenShareEnabled.mockClear()

    await frame(session, outside, alone)

    expect(officeRoom.localParticipant.publishTrack).not.toHaveBeenCalled()
    expect(officeRoom.localParticipant.setScreenShareEnabled).toHaveBeenCalledExactlyOnceWith(false)
    expect(privateRoomsBuilt).toHaveLength(1)
  })

  it('stops reacting to the room it left: its late events do not reach the owner, the new room\'s do', async () => {
    const { session, officeRoom, privateRoomsBuilt, events } = setup()
    session.connect({ microphoneEnabled: false, cameraEnabled: false })
    await settle()
    await frame(session, inZone, withNeighbour)
    events.onScreenShareEnded.mockClear()

    officeRoom.localParticipant.emit(ParticipantEvent.LocalTrackUnpublished, { source: Track.Source.ScreenShare })
    expect(events.onScreenShareEnded).not.toHaveBeenCalled()

    privateRoomsBuilt[0].localParticipant.emit(ParticipantEvent.LocalTrackUnpublished, { source: Track.Source.ScreenShare })
    expect(events.onScreenShareEnded).toHaveBeenCalledTimes(1)
  })
})

describe('localAvSession leaving while the screen share is still being detached', () => {
  it('ends in the office, not stuck on the private room it already left', async () => {
    const { session, officeRoom, privateRoomsBuilt } = setup()
    session.connect({ microphoneEnabled: true, cameraEnabled: false })
    await settle()
    const shareTrack = { kind: 'video', stop: vi.fn() }
    officeRoom.localParticipant.publications.set(Track.Source.ScreenShare, { track: shareTrack })
    const detach = deferred()
    officeRoom.localParticipant.unpublishTrack.mockImplementationOnce(() => detach.promise)

    // Someone joins the zone: the private room connects, but the share is slow to be detached.
    await frame(session, inZone, withNeighbour)
    expect(privateRoomsBuilt).toHaveLength(1)
    expect(session.privateRoom).toBeNull()

    // The person walks out before that finished: the private room is torn down, the office comes back.
    await frame(session, outside, alone)
    expect(session.activeRoom).toBe(officeRoom)

    // The slow detach finally completes.
    detach.resolve()
    await settle()

    expect(session.privateRoom).toBeNull()
    expect(session.activeRoom).toBe(officeRoom)
    expect(session.mediaConnecting).toBe(false)
    // The share was detached from the office and has no room to go to: it stops, it is not left capturing.
    expect(shareTrack.stop).toHaveBeenCalledTimes(1)
    expect(privateRoomsBuilt[0].localParticipant.publishTrack).not.toHaveBeenCalled()
  })

  it('does not tell the person a share failed to continue when they had already left', async () => {
    const { session, officeRoom, events } = setup()
    session.connect({ microphoneEnabled: false, cameraEnabled: false })
    await settle()
    officeRoom.localParticipant.publications.set(Track.Source.ScreenShare, { track: { kind: 'video', stop: vi.fn() } })
    const detach = deferred()
    officeRoom.localParticipant.unpublishTrack.mockImplementationOnce(() => detach.promise)
    await frame(session, inZone, withNeighbour)
    await frame(session, outside, alone)

    detach.resolve()
    await settle()

    expect(events.onScreenShareHandoffFailed).not.toHaveBeenCalled()
  })
})

describe('localAvSession re-entering the zone before the office finished reconnecting', () => {
  it('leaves the microphone and camera on the private room, nothing is published on the office afterwards', async () => {
    const { session, officeRoom, privateRoomsBuilt } = setup()
    session.connect({ microphoneEnabled: true, cameraEnabled: false })
    await settle()
    await frame(session, inZone, withNeighbour)
    expect(session.privateRoom).toBe(privateRoomsBuilt[0])

    // Walking out starts the way back: the office asks for its token, and that is slow.
    const officeToken = deferred<{ token: string, url: string }>()
    vi.mocked(fetchLiveKitToken).mockImplementationOnce(() => officeToken.promise)
    await frame(session, outside, alone)
    expect(session.privateRoom).toBeNull()

    // Before it answers, the person goes back into the zone and a new private room connects.
    await frame(session, inZone, withNeighbour)
    expect(privateRoomsBuilt).toHaveLength(2)
    expect(session.privateRoom).toBe(privateRoomsBuilt[1])
    officeRoom.localParticipant.setMicrophoneEnabled.mockClear()

    officeToken.resolve({ token: 'late', url: 'wss://fake' })
    await settle()

    expect(officeRoom.localParticipant.setMicrophoneEnabled).not.toHaveBeenCalled()
    expect(session.privateRoom).toBe(privateRoomsBuilt[1])
  })
})

describe('localAvSession private-room connection error', () => {
  it('shows the failure, then "Try again", then clears it once connected', async () => {
    const { session } = setup()
    session.connect({ microphoneEnabled: false, cameraEnabled: false })
    await settle()
    vi.mocked(fetchLiveKitToken).mockRejectedValueOnce(new Error('down')).mockRejectedValueOnce(new Error('down')).mockRejectedValueOnce(new Error('down'))

    await frame(session, inZone, withNeighbour)
    expect(session.connectError).toEqual({ zoneId: 1, retrying: false })
    expect(session.privateRoom).toBeNull()

    session.retry()
    expect(session.connectError).toEqual({ zoneId: 1, retrying: true })
    await frame(session, inZone, withNeighbour)

    expect(session.connectError).toBeNull()
    expect(session.privateRoom).not.toBeNull()
  })
})

describe('localAvSession office proximity and Busy', () => {
  it('sets the volume of nearby people in the office each frame', async () => {
    const { session, officeRoom } = setup()
    session.connect({ microphoneEnabled: false, cameraEnabled: false })
    await settle()
    const remote = { setVolume: vi.fn() }
    officeRoom.remoteParticipants.set('remote-1', remote)

    session.update(outside, new Map([['remote-1', { x: 510, y: 500, presence: 'available' }]]))

    expect([...session.nearbySessionIds]).toEqual(['remote-1'])
    expect(remote.setVolume).toHaveBeenCalled()
  })

  it('refuses Busy while sharing the screen, and allows leaving Busy', async () => {
    const { session, officeRoom } = setup()
    session.connect({ microphoneEnabled: false, cameraEnabled: false })
    await settle()
    officeRoom.localParticipant.isScreenShareEnabled = true

    expect(session.isBusyBlocked('busy')).toBe(true)
    expect(session.isBusyBlocked('available')).toBe(false)
  })

  it('leaves every room when asked to disconnect', async () => {
    const { session, officeRoom, privateRoomsBuilt } = setup()
    session.connect({ microphoneEnabled: false, cameraEnabled: false })
    await settle()
    await frame(session, inZone, withNeighbour)

    session.disconnect()
    await settle()

    expect(officeRoom.disconnect).toHaveBeenCalled()
    expect(privateRoomsBuilt[0].disconnect).toHaveBeenCalled()
  })
})
