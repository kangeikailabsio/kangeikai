import type { Room } from 'livekit-client'
import { MediaControls } from '$lib/av/media-controls'
import { resolveScreenShareQuality } from '$lib/av/screen-share-quality'
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

  it('publishes the screen share track at the default (1080p) quality and clears screenShareUnavailable on success', async () => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))

    await controls.setScreenShareEnabled(true)

    const { captureOptions, publishOptions } = resolveScreenShareQuality('1080p')
    expect(participant.setScreenShareEnabled).toHaveBeenCalledWith(true, captureOptions, publishOptions)
    expect(controls.screenShareUnavailable).toBe(false)
  })

  it('stops sharing without passing capture/publish options', async () => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))

    await controls.setScreenShareEnabled(false)

    expect(participant.setScreenShareEnabled).toHaveBeenCalledWith(false)
  })

  it.each(['720p', '1080p', '2k'] as const)('publishes at the requested %s tier', async (tier) => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))

    await controls.setScreenShareEnabled(true, tier)

    const { captureOptions, publishOptions } = resolveScreenShareQuality(tier)
    expect(participant.setScreenShareEnabled).toHaveBeenCalledWith(true, captureOptions, publishOptions)
    expect(controls.screenShareQuality).toBe(tier)
  })

  it('reuses the last-applied quality when re-enabling without an explicit tier (room-switch carry-forward)', async () => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))

    await controls.setScreenShareEnabled(true, '2k')
    await controls.setScreenShareEnabled(false)
    await controls.setScreenShareEnabled(true)

    const { captureOptions, publishOptions } = resolveScreenShareQuality('2k')
    expect(participant.setScreenShareEnabled).toHaveBeenLastCalledWith(true, captureOptions, publishOptions)
    expect(controls.screenShareQuality).toBe('2k')
  })

  it('does not request audio capture by default', async () => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))

    await controls.setScreenShareEnabled(true)

    const { captureOptions, publishOptions } = resolveScreenShareQuality('1080p', false)
    expect(participant.setScreenShareEnabled).toHaveBeenCalledWith(true, captureOptions, publishOptions)
    expect(controls.screenShareAudio).toBe(false)
  })

  it('requests audio capture when shareAudio is passed as true', async () => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))

    await controls.setScreenShareEnabled(true, '1080p', true)

    const { captureOptions, publishOptions } = resolveScreenShareQuality('1080p', true)
    expect(participant.setScreenShareEnabled).toHaveBeenCalledWith(true, captureOptions, publishOptions)
    expect(controls.screenShareAudio).toBe(true)
  })

  it('reuses the last-applied shareAudio choice when re-enabling without an explicit value (room-switch carry-forward)', async () => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))

    await controls.setScreenShareEnabled(true, '1080p', true)
    await controls.setScreenShareEnabled(false)
    await controls.setScreenShareEnabled(true)

    const { captureOptions, publishOptions } = resolveScreenShareQuality('1080p', true)
    expect(participant.setScreenShareEnabled).toHaveBeenLastCalledWith(true, captureOptions, publishOptions)
    expect(controls.screenShareAudio).toBe(true)
  })

  it('defaults screenShareAudio to false before any share has ever started', () => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))

    expect(controls.screenShareAudio).toBe(false)
  })

  it('defaults screenShareQuality to 1080p before any share has ever started', () => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))

    expect(controls.screenShareQuality).toBe('1080p')
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
