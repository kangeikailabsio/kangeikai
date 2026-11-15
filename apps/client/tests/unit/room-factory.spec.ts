import type { Room } from 'livekit-client'
import { PrivateRoomController } from '$lib/av/private-room-controller'
import { ProximityAudioController } from '$lib/av/proximity-audio-controller'
import { describe, expect, it, vi } from 'vitest'

vi.mock('$lib/av/livekit-token-client', () => ({
  fetchLiveKitToken: vi.fn(async () => ({ token: 'fake-token', url: 'wss://fake' })),
}))

vi.mock('$lib/av/attach-remote-audio', () => ({
  attachRemoteAudioElements: vi.fn(),
}))

/** A room that does nothing, built without the LiveKit SDK: what the factory hands a controller in a test. */
function fakeRoom() {
  return {
    options: {},
    remoteParticipants: new Map(),
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
  } as unknown as Room & { connect: ReturnType<typeof vi.fn>, disconnect: ReturnType<typeof vi.fn> }
}

const options = { identity: 'me', name: 'Me', proof: 'proof' }
const position = { x: 50, y: 50, presence: 'available' as const }
const zones = [{ id: 1, name: 'desk-01', x: 0, y: 0, width: 100, height: 100 }]

describe('room factories (issue #263)', () => {
  it('the office controller uses the room its factory builds, once, and keeps it across connects', async () => {
    const room = fakeRoom()
    const createRoom = vi.fn(() => room)
    const controller = new ProximityAudioController('http://fake/livekit-token', () => ({}), createRoom)

    await controller.connect(options, position)
    await controller.connect(options, position)

    expect(createRoom).toHaveBeenCalledTimes(1)
    expect(controller.liveKitRoom).toBe(room)
    expect(room.connect).toHaveBeenCalledTimes(2)
  })

  it('the private-room controller builds a fresh room for each connection and hands it to onConnect', async () => {
    const rooms: Room[] = []
    const createRoom = vi.fn(() => {
      const room = fakeRoom()
      rooms.push(room)
      return room
    })
    const controller = new PrivateRoomController('http://fake/livekit-token', 0, () => ({}), createRoom)
    controller.setZones(zones)
    const onConnect = vi.fn()
    const handlers = { onConnect, onDisconnect: vi.fn(), onError: vi.fn() }
    const withRemote = new Map([['remote-1', { x: 60, y: 60, presence: 'available' as const }]])

    await controller.update(options, position, withRemote, handlers, () => {})
    await controller.update(options, position, new Map(), handlers, () => {})
    await controller.update(options, position, withRemote, handlers, () => {})

    expect(createRoom).toHaveBeenCalledTimes(2)
    expect(onConnect).toHaveBeenNthCalledWith(1, rooms[0], 1)
    expect(onConnect).toHaveBeenNthCalledWith(2, rooms[1], 1)
    expect(rooms[0].disconnect).toHaveBeenCalledTimes(1)
  })
})
