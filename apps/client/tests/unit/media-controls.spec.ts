import type { Room } from 'livekit-client'
import { isScreenShareCaptureSupported, MediaControls } from '$lib/av/media-controls'
import { resolveScreenShareQuality } from '$lib/av/screen-share-quality'
import { ParticipantEvent, Track } from 'livekit-client'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

  it('publishes the screen share track at the default (1080p) quality', async () => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))

    await controls.setScreenShareEnabled(true)

    const { captureOptions, publishOptions } = resolveScreenShareQuality('1080p')
    expect(participant.setScreenShareEnabled).toHaveBeenCalledWith(true, captureOptions, publishOptions)
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

  it('swallows a rejected publish (denied permission or cancelled picker) instead of throwing (issue #115)', async () => {
    const participant = createFakeLocalParticipant()
    participant.setScreenShareEnabled.mockRejectedValueOnce(new Error('Permission denied'))
    const controls = new MediaControls(createFakeRoom(participant))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(controls.setScreenShareEnabled(true)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()

    warn.mockRestore()
  })

  it('stays retriable after a rejected attempt — a later call goes through normally (issue #115)', async () => {
    const participant = createFakeLocalParticipant()
    participant.setScreenShareEnabled.mockRejectedValueOnce(new Error('Permission denied'))
    const controls = new MediaControls(createFakeRoom(participant))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await controls.setScreenShareEnabled(true)
    await controls.setScreenShareEnabled(true)

    const { captureOptions, publishOptions } = resolveScreenShareQuality('1080p')
    expect(participant.setScreenShareEnabled).toHaveBeenLastCalledWith(true, captureOptions, publishOptions)

    vi.restoreAllMocks()
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

describe('isScreenShareCaptureSupported', () => {
  it('is true when getDisplayMedia is a function on navigator.mediaDevices', () => {
    const nav = { mediaDevices: { getDisplayMedia: () => Promise.resolve() } } as unknown as Navigator

    expect(isScreenShareCaptureSupported(nav)).toBe(true)
  })

  it('is false when navigator.mediaDevices is missing entirely', () => {
    const nav = {} as unknown as Navigator

    expect(isScreenShareCaptureSupported(nav)).toBe(false)
  })

  it('is false when mediaDevices exists but has no getDisplayMedia', () => {
    const nav = { mediaDevices: {} } as unknown as Navigator

    expect(isScreenShareCaptureSupported(nav)).toBe(false)
  })
})

describe('mediaControls screenShareUnsupported', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reflects the current browser\'s getDisplayMedia support', () => {
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: () => Promise.resolve() } })
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))

    expect(controls.screenShareUnsupported).toBe(false)
  })

  it('is true when the browser has no getDisplayMedia at all', () => {
    vi.stubGlobal('navigator', {})
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))

    expect(controls.screenShareUnsupported).toBe(true)
  })

  it('never becomes true just because a capture attempt failed (issue #115)', async () => {
    vi.stubGlobal('navigator', { mediaDevices: { getDisplayMedia: () => Promise.resolve() } })
    const participant = createFakeLocalParticipant()
    participant.setScreenShareEnabled.mockRejectedValueOnce(new Error('Permission denied'))
    const controls = new MediaControls(createFakeRoom(participant))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await controls.setScreenShareEnabled(true)

    expect(controls.screenShareUnsupported).toBe(false)

    vi.restoreAllMocks()
  })
})
