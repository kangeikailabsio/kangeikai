import type { Room } from 'livekit-client'
import { MediaControls } from '$lib/av/media-controls'
import { ParticipantEvent, Track } from 'livekit-client'
import { describe, expect, it, vi } from 'vitest'

interface FakeLocalParticipant {
  isMicrophoneEnabled: boolean
  isCameraEnabled: boolean
  isScreenShareEnabled: boolean
  setMicrophoneEnabled: ReturnType<typeof vi.fn>
  setCameraEnabled: ReturnType<typeof vi.fn>
  setScreenShareEnabled: ReturnType<typeof vi.fn>
  on: ReturnType<typeof vi.fn>
  emit: (event: string, ...args: unknown[]) => void
}

/**
 * `MediaControls` only ever touches a handful of members on `room.localParticipant` — a fake
 * implementing just those (plus a minimal on/emit pair to drive `LocalTrackUnpublished`) is
 * enough to exercise it without a real LiveKit connection.
 */
function createFakeLocalParticipant(): FakeLocalParticipant {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()

  return {
    isMicrophoneEnabled: false,
    isCameraEnabled: false,
    isScreenShareEnabled: false,
    setMicrophoneEnabled: vi.fn(async () => undefined),
    setCameraEnabled: vi.fn(async () => undefined),
    setScreenShareEnabled: vi.fn(async () => undefined),
    on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      const callbacks = listeners.get(event) ?? []
      callbacks.push(callback)
      listeners.set(event, callbacks)
    }),
    emit(event: string, ...args: unknown[]) {
      for (const callback of listeners.get(event) ?? []) {
        callback(...args)
      }
    },
  }
}

function createFakeRoom(localParticipant: FakeLocalParticipant): Room {
  return { localParticipant } as unknown as Room
}

describe('mediaControls screen share', () => {
  it('reflects the participant\'s isScreenShareEnabled', () => {
    const participant = createFakeLocalParticipant()
    participant.isScreenShareEnabled = true
    const controls = new MediaControls(createFakeRoom(participant))

    expect(controls.screenShareEnabled).toBe(true)
  })

  it('publishes the screen share track and clears screenShareUnavailable on success', async () => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))

    await controls.setScreenShareEnabled(true)

    expect(participant.setScreenShareEnabled).toHaveBeenCalledWith(true)
    expect(controls.screenShareUnavailable).toBe(false)
  })

  it('swallows a rejected publish (denied permission or cancelled picker) into screenShareUnavailable, never throwing', async () => {
    const participant = createFakeLocalParticipant()
    participant.setScreenShareEnabled.mockRejectedValueOnce(new Error('Permission denied'))
    const controls = new MediaControls(createFakeRoom(participant))

    await expect(controls.setScreenShareEnabled(true)).resolves.toBeUndefined()
    expect(controls.screenShareUnavailable).toBe(true)
  })

  it('recovers screenShareUnavailable after a later successful call', async () => {
    const participant = createFakeLocalParticipant()
    participant.setScreenShareEnabled.mockRejectedValueOnce(new Error('Permission denied'))
    const controls = new MediaControls(createFakeRoom(participant))

    await controls.setScreenShareEnabled(true)
    expect(controls.screenShareUnavailable).toBe(true)

    await controls.setScreenShareEnabled(true)
    expect(controls.screenShareUnavailable).toBe(false)
  })

  it('fires onScreenShareEnded when the screen-share track is unpublished (native "Stop sharing")', () => {
    const participant = createFakeLocalParticipant()
    const onScreenShareEnded = vi.fn()
    // eslint-disable-next-line no-new -- constructing for its side effect of registering the listener
    new MediaControls(createFakeRoom(participant), onScreenShareEnded)

    participant.emit(ParticipantEvent.LocalTrackUnpublished, { source: Track.Source.ScreenShare })

    expect(onScreenShareEnded).toHaveBeenCalledOnce()
  })

  it('does not fire onScreenShareEnded when a different track (e.g. camera) is unpublished', () => {
    const participant = createFakeLocalParticipant()
    const onScreenShareEnded = vi.fn()
    // eslint-disable-next-line no-new -- constructing for its side effect of registering the listener
    new MediaControls(createFakeRoom(participant), onScreenShareEnded)

    participant.emit(ParticipantEvent.LocalTrackUnpublished, { source: Track.Source.Camera })

    expect(onScreenShareEnded).not.toHaveBeenCalled()
  })

  it('does not throw when a screen-share track ends and no onScreenShareEnded callback was provided', () => {
    const participant = createFakeLocalParticipant()
    // eslint-disable-next-line no-new -- constructing for its side effect of registering the listener
    new MediaControls(createFakeRoom(participant))

    expect(() => participant.emit(ParticipantEvent.LocalTrackUnpublished, { source: Track.Source.ScreenShare })).not.toThrow()
  })
})
