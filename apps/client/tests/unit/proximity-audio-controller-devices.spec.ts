import { ProximityAudioController } from '$lib/av/proximity-audio-controller'
import { describe, expect, it, vi } from 'vitest'

// What the office room's options were at the moment it connected (so a device applied after connecting would not count).
const optionsWhenConnecting: Array<Record<string, unknown>> = []

vi.mock('livekit-client', () => {
  class FakeRoom {
    options: Record<string, unknown> = {}
    connect = vi.fn(async () => {
      optionsWhenConnecting.push(JSON.parse(JSON.stringify(this.options)))
    })

    disconnect = vi.fn(async () => {})
  }
  return { Room: FakeRoom, Track: { Source: {} } }
})

vi.mock('$lib/av/livekit-token-client', () => ({
  fetchLiveKitToken: vi.fn(async () => ({ token: 'fake-token', url: 'wss://fake' })),
}))

vi.mock('$lib/av/attach-remote-audio', () => ({
  attachRemoteAudioElements: vi.fn(),
}))

const options = { identity: 'me', name: 'Me', proof: 'proof' }
const position = { x: 0, y: 0, presence: 'available' as const }

describe('proximityAudioController devices (issue #245)', () => {
  it('connects the office room with the microphone and camera the person chose', async () => {
    optionsWhenConnecting.length = 0
    const controller = new ProximityAudioController('http://fake/livekit-token', () => ({ audioinput: 'mic-2', videoinput: 'cam-9' }))

    await controller.connect(options, position)

    expect(optionsWhenConnecting).toEqual([{ audioCaptureDefaults: { deviceId: 'mic-2' }, videoCaptureDefaults: { deviceId: 'cam-9' } }])
  })

  it('reads the choice again on every connect, because the office room is reused and the choice can change in between', async () => {
    optionsWhenConnecting.length = 0
    let choice: { audioinput?: string } = { audioinput: 'mic-1' }
    const controller = new ProximityAudioController('http://fake/livekit-token', () => choice)

    await controller.connect(options, position)
    choice = { audioinput: 'mic-2' }
    await controller.connect(options, position)

    expect(optionsWhenConnecting.map(o => (o.audioCaptureDefaults as { deviceId: string }).deviceId)).toEqual(['mic-1', 'mic-2'])
  })

  it('leaves the browser default alone when nothing was chosen', async () => {
    optionsWhenConnecting.length = 0
    const controller = new ProximityAudioController('http://fake/livekit-token', () => ({}))

    await controller.connect(options, position)

    expect(optionsWhenConnecting).toEqual([{}])
  })
})
