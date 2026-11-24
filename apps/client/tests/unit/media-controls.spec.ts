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
  getTrackPublication: ReturnType<typeof vi.fn>
  unpublishTrack: ReturnType<typeof vi.fn>
  publishTrack: ReturnType<typeof vi.fn>
  publications: Map<Track.Source, { track: unknown }>
  on: ReturnType<typeof vi.fn>
  off: ReturnType<typeof vi.fn>
  connectionQuality?: string
  emit: (event: string, ...args: unknown[]) => void
}

/**
 * `MediaControls` only ever touches a handful of members on `room.localParticipant` — a fake
 * implementing just those (plus a minimal on/off/emit set to drive `LocalTrackUnpublished`) is
 * enough to exercise it without a real LiveKit connection. `publications` backs
 * `getTrackPublication` — tests seed it directly to simulate an already-sharing participant
 * (issue #116's detach/adopt handoff).
 */
function createFakeLocalParticipant(): FakeLocalParticipant {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()
  const publications = new Map<Track.Source, { track: unknown }>()

  return {
    isMicrophoneEnabled: false,
    isCameraEnabled: false,
    isScreenShareEnabled: false,
    setMicrophoneEnabled: vi.fn(async () => undefined),
    setCameraEnabled: vi.fn(async () => undefined),
    setScreenShareEnabled: vi.fn(async () => undefined),
    getTrackPublication: vi.fn((source: Track.Source) => publications.get(source)),
    unpublishTrack: vi.fn(async () => undefined),
    publishTrack: vi.fn(async () => undefined),
    publications,
    on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      const callbacks = listeners.get(event) ?? []
      callbacks.push(callback)
      listeners.set(event, callbacks)
    }),
    off: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      listeners.set(event, (listeners.get(event) ?? []).filter(existing => existing !== callback))
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

describe('mediaControls screen share handoff (issue #116)', () => {
  it('detachScreenShareTrack returns undefined when nothing is being shared', async () => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))

    await expect(controls.detachScreenShareTrack()).resolves.toBeUndefined()
    expect(participant.unpublishTrack).not.toHaveBeenCalled()
  })

  it('detachScreenShareTrack unpublishes (without stopping) and returns the video track plus the current quality/audio preference', async () => {
    const participant = createFakeLocalParticipant()
    const videoTrack = { kind: 'video' }
    participant.publications.set(Track.Source.ScreenShare, { track: videoTrack })
    const controls = new MediaControls(createFakeRoom(participant))
    await controls.setScreenShareEnabled(true, '2k', false)

    const handoff = await controls.detachScreenShareTrack()

    expect(participant.unpublishTrack).toHaveBeenCalledWith(videoTrack, false)
    expect(handoff).toEqual({ videoTrack, audioTrack: undefined, quality: '2k', shareAudio: false })
  })

  it('detachScreenShareTrack also detaches the paired audio track when "share audio too" was on', async () => {
    const participant = createFakeLocalParticipant()
    const videoTrack = { kind: 'video' }
    const audioTrack = { kind: 'audio' }
    participant.publications.set(Track.Source.ScreenShare, { track: videoTrack })
    participant.publications.set(Track.Source.ScreenShareAudio, { track: audioTrack })
    const controls = new MediaControls(createFakeRoom(participant))
    await controls.setScreenShareEnabled(true, '1080p', true)

    const handoff = await controls.detachScreenShareTrack()

    expect(participant.unpublishTrack).toHaveBeenCalledWith(videoTrack, false)
    expect(participant.unpublishTrack).toHaveBeenCalledWith(audioTrack, false)
    expect(handoff).toEqual({ videoTrack, audioTrack, quality: '1080p', shareAudio: true })
  })

  it('adoptScreenShareTrack republishes the handed-off video track at its captured quality\'s encoding, without capturing a fresh one', async () => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))
    const videoTrack = { kind: 'video' }

    await controls.adoptScreenShareTrack({ videoTrack: videoTrack as never, audioTrack: undefined, quality: '2k', shareAudio: false })

    const { publishOptions } = resolveScreenShareQuality('2k', false)
    expect(participant.publishTrack).toHaveBeenCalledWith(videoTrack, publishOptions)
    expect(participant.setScreenShareEnabled).not.toHaveBeenCalled()
    expect(controls.screenShareQuality).toBe('2k')
  })

  it('adoptScreenShareTrack also republishes the paired audio track when present in the handoff', async () => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))
    const videoTrack = { kind: 'video' }
    const audioTrack = { kind: 'audio' }

    await controls.adoptScreenShareTrack({ videoTrack: videoTrack as never, audioTrack: audioTrack as never, quality: '1080p', shareAudio: true })

    expect(participant.publishTrack).toHaveBeenCalledWith(audioTrack)
    expect(controls.screenShareAudio).toBe(true)
  })

  it('adoptScreenShareTrack propagates a republish failure instead of swallowing it (unlike setScreenShareEnabled)', async () => {
    const participant = createFakeLocalParticipant()
    participant.publishTrack.mockRejectedValueOnce(new Error('private room rejected the track'))
    const controls = new MediaControls(createFakeRoom(participant))

    await expect(controls.adoptScreenShareTrack({ videoTrack: {} as never, audioTrack: undefined, quality: '1080p', shareAudio: false }))
      .rejects
      .toThrow('private room rejected the track')
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

describe('mediaControls intent (issue #239)', () => {
  /** A publish that stays in flight until the test resolves it, like `getUserMedia` plus publishing does for a few hundred ms. */
  function pending<T = void>() {
    let resolve!: (value: T) => void
    let reject!: (reason: unknown) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  it('records the microphone intent as soon as it is requested, before the publish finishes', () => {
    const participant = createFakeLocalParticipant()
    const publish = pending()
    participant.setMicrophoneEnabled.mockReturnValue(publish.promise)
    const controls = new MediaControls(createFakeRoom(participant))

    void controls.setMicrophoneEnabled(true)

    expect(controls.microphoneIntent).toBe(true)
    expect(controls.microphoneEnabled).toBe(false) // the published track still lags
  })

  it('records the camera intent the same way', () => {
    const participant = createFakeLocalParticipant()
    participant.setCameraEnabled.mockReturnValue(pending().promise)
    const controls = new MediaControls(createFakeRoom(participant))

    void controls.setCameraEnabled(true)

    expect(controls.cameraIntent).toBe(true)
    expect(controls.cameraEnabled).toBe(false)
  })

  it('keeps the intent when the publish is rejected, so it can be retried elsewhere', async () => {
    const participant = createFakeLocalParticipant()
    participant.setMicrophoneEnabled.mockRejectedValue(new Error('Cancelled publication by calling unpublish'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const controls = new MediaControls(createFakeRoom(participant))

    await controls.setMicrophoneEnabled(true)

    expect(controls.microphoneIntent).toBe(true)
    expect(controls.microphoneUnavailable).toBe(true)
  })

  it('follows the latest request, on and off', async () => {
    const controls = new MediaControls(createFakeRoom(createFakeLocalParticipant()))

    await controls.setMicrophoneEnabled(true)
    expect(controls.microphoneIntent).toBe(true)
    await controls.setMicrophoneEnabled(false)
    expect(controls.microphoneIntent).toBe(false)
  })

  it('declares both intents at once, synchronously, before any publish starts', () => {
    const controls = new MediaControls(createFakeRoom(createFakeLocalParticipant()))

    controls.declareIntent({ microphoneEnabled: true, cameraEnabled: true })

    expect(controls.microphoneIntent).toBe(true)
    expect(controls.cameraIntent).toBe(true)
  })

  it('falls back to what is actually published when no intent was ever given', () => {
    const participant = createFakeLocalParticipant()
    participant.isMicrophoneEnabled = true
    participant.isCameraEnabled = true
    const controls = new MediaControls(createFakeRoom(participant))

    expect(controls.microphoneIntent).toBe(true)
    expect(controls.cameraIntent).toBe(true)
  })

  it('while busy, reports what ending busy will restore, not the suppression', async () => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))
    controls.declareIntent({ microphoneEnabled: true, cameraEnabled: true })

    await controls.beginBusy()

    expect(controls.microphoneIntent).toBe(true)
    expect(controls.cameraIntent).toBe(true)
  })

  it('takes the busy snapshot from the intent even when the publish is still in flight', async () => {
    const participant = createFakeLocalParticipant()
    participant.setMicrophoneEnabled.mockReturnValueOnce(pending().promise)
    const controls = new MediaControls(createFakeRoom(participant))
    void controls.setMicrophoneEnabled(true) // published state is still false

    await controls.beginBusy()
    await controls.endBusy()

    expect(participant.setMicrophoneEnabled).toHaveBeenLastCalledWith(true)
    expect(controls.microphoneIntent).toBe(true)
  })

  it('keeps an explicitly muted microphone muted through busy and back', async () => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))
    controls.declareIntent({ microphoneEnabled: false, cameraEnabled: false })

    await controls.beginBusy()
    await controls.endBusy()

    expect(controls.microphoneIntent).toBe(false)
    expect(participant.setMicrophoneEnabled).toHaveBeenLastCalledWith(false)
  })
})

describe('mediaControls failure kinds and device switching (issue #245)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  function roomWithSwitch(participant: FakeLocalParticipant) {
    const switchActiveDevice = vi.fn(async () => true)
    const room = { localParticipant: participant, options: {} as Record<string, unknown>, switchActiveDevice } as unknown as Room
    return { room, switchActiveDevice }
  }

  it('records why the microphone failed: blocked, no device, in use', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))

    participant.setMicrophoneEnabled.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotAllowedError' }))
    await controls.setMicrophoneEnabled(true)
    expect(controls.microphoneFailure).toBe('blocked')

    participant.setMicrophoneEnabled.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotFoundError' }))
    await controls.setMicrophoneEnabled(true)
    expect(controls.microphoneFailure).toBe('not-found')

    participant.setMicrophoneEnabled.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotReadableError' }))
    await controls.setMicrophoneEnabled(true)
    expect(controls.microphoneFailure).toBe('in-use')
  })

  it('clears the failure when the next attempt works, and the camera has its own', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))
    participant.setCameraEnabled.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotFoundError' }))

    await controls.setCameraEnabled(true)
    expect(controls.cameraFailure).toBe('not-found')
    expect(controls.microphoneFailure).toBeUndefined()

    await controls.setCameraEnabled(true)
    expect(controls.cameraFailure).toBeUndefined()
  })

  it('switches the microphone live when it is on, and points later captures at it', async () => {
    const { room, switchActiveDevice } = roomWithSwitch(createFakeLocalParticipant())
    const controls = new MediaControls(room)
    controls.declareIntent({ microphoneEnabled: true, cameraEnabled: false })

    const switched = await controls.switchDevice('audioinput', 'mic-2')

    expect(switched).toBe(true)
    expect(switchActiveDevice).toHaveBeenCalledWith('audioinput', 'mic-2')
    expect(room.options.audioCaptureDefaults).toEqual({ deviceId: 'mic-2' })
  })

  it('only remembers the device when the camera is off: it applies when it is turned on', async () => {
    const { room, switchActiveDevice } = roomWithSwitch(createFakeLocalParticipant())
    const controls = new MediaControls(room)
    controls.declareIntent({ microphoneEnabled: true, cameraEnabled: false })

    const switched = await controls.switchDevice('videoinput', 'cam-9')

    expect(switched).toBe(true)
    expect(switchActiveDevice).not.toHaveBeenCalled()
    expect(room.options.videoCaptureDefaults).toEqual({ deviceId: 'cam-9' })
  })

  it('reports a failed live switch with its reason instead of throwing', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { room, switchActiveDevice } = roomWithSwitch(createFakeLocalParticipant())
    switchActiveDevice.mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NotReadableError' }))
    const controls = new MediaControls(room)
    controls.declareIntent({ microphoneEnabled: true, cameraEnabled: false })

    const switched = await controls.switchDevice('audioinput', 'mic-2')

    expect(switched).toBe(false)
    expect(controls.microphoneFailure).toBe('in-use')
  })
})

describe('mediaControls device loss (issue #300)', () => {
  /** A published microphone or camera track that can be told its device went away. */
  function publishTrack(participant: FakeLocalParticipant, source: Track.Source) {
    let ended: () => void = () => {}
    const on = vi.fn((_event: string, callback: () => void) => {
      ended = callback
    })
    const publication = { source, track: { on } }
    participant.publications.set(source, publication)
    participant.emit('localTrackPublished', publication)
    return { publication, end: () => ended() }
  }

  it('reports the microphone or camera that stopped by itself, each by its own name', () => {
    const participant = createFakeLocalParticipant()
    const onDeviceLost = vi.fn()
    const controls = new MediaControls(createFakeRoom(participant), undefined, undefined, onDeviceLost)
    expect(controls).toBeDefined()

    publishTrack(participant, Track.Source.Microphone).end()
    publishTrack(participant, Track.Source.Camera).end()

    expect(onDeviceLost.mock.calls).toEqual([['microphone'], ['camera']])
  })

  it('listens for the track\'s end event, which LiveKit only emits when the device went away', () => {
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant), undefined, undefined, vi.fn())
    expect(controls).toBeDefined()

    const { publication } = publishTrack(participant, Track.Source.Microphone)

    expect(publication.track.on).toHaveBeenCalledWith('ended', expect.any(Function))
  })

  it('ignores a screen share, a publication without a track, and a track that is no longer the published one', () => {
    const participant = createFakeLocalParticipant()
    const onDeviceLost = vi.fn()
    const controls = new MediaControls(createFakeRoom(participant), undefined, undefined, onDeviceLost)
    expect(controls).toBeDefined()

    publishTrack(participant, Track.Source.ScreenShare).end()
    participant.emit('localTrackPublished', { source: Track.Source.Microphone, track: undefined })
    const stale = publishTrack(participant, Track.Source.Camera)
    participant.publications.set(Track.Source.Camera, { track: {} })
    stale.end()

    expect(onDeviceLost).not.toHaveBeenCalled()
  })

  it('stops listening to a room it left, and listens to the new one', () => {
    const office = createFakeLocalParticipant()
    const priv = createFakeLocalParticipant()
    const onDeviceLost = vi.fn()
    const controls = new MediaControls(createFakeRoom(office), undefined, undefined, onDeviceLost)

    controls.switchRoom(createFakeRoom(priv))
    publishTrack(office, Track.Source.Microphone).end()
    expect(onDeviceLost).not.toHaveBeenCalled()
    publishTrack(priv, Track.Source.Microphone).end()

    expect(onDeviceLost).toHaveBeenCalledExactlyOnceWith('microphone')
  })
})

describe('mediaControls retrying devices (issue #301)', () => {
  const notFound = Object.assign(new Error('x'), { name: 'NotFoundError' })
  const inUse = Object.assign(new Error('x'), { name: 'NotReadableError' })
  const blocked = Object.assign(new Error('x'), { name: 'NotAllowedError' })

  /** Controls whose microphone and/or camera failed once with the given errors, the person wanting both on. */
  async function failed(errors: { microphone?: Error, camera?: Error }) {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const participant = createFakeLocalParticipant()
    const controls = new MediaControls(createFakeRoom(participant))
    if (errors.microphone)
      participant.setMicrophoneEnabled.mockRejectedValueOnce(errors.microphone)
    if (errors.camera)
      participant.setCameraEnabled.mockRejectedValueOnce(errors.camera)
    await controls.setMicrophoneEnabled(true)
    await controls.setCameraEnabled(true)
    participant.setMicrophoneEnabled.mockClear()
    participant.setCameraEnabled.mockClear()
    return { participant, controls }
  }

  it('tries a missing microphone and a busy camera again, and clears the failure when it works', async () => {
    const { participant, controls } = await failed({ microphone: notFound, camera: inUse })

    expect(await controls.retryUnavailableDevices()).toBe(true)

    expect(participant.setMicrophoneEnabled).toHaveBeenCalledExactlyOnceWith(true)
    expect(participant.setCameraEnabled).toHaveBeenCalledExactlyOnceWith(true)
    expect(controls.microphoneUnavailable).toBe(false)
    expect(controls.microphoneFailure).toBeUndefined()
    expect(controls.cameraUnavailable).toBe(false)
  })

  it('keeps the new reason when the retry fails again', async () => {
    const { participant, controls } = await failed({ microphone: notFound })
    participant.setMicrophoneEnabled.mockRejectedValueOnce(inUse)

    expect(await controls.retryUnavailableDevices()).toBe(true)

    expect(controls.microphoneUnavailable).toBe(true)
    expect(controls.microphoneFailure).toBe('in-use')
  })

  it('does not retry a blocked permission, an unknown failure, or a device that works', async () => {
    const { participant, controls } = await failed({ microphone: blocked, camera: new Error('boom') })

    expect(await controls.retryUnavailableDevices()).toBe(false)

    expect(participant.setMicrophoneEnabled).not.toHaveBeenCalled()
    expect(participant.setCameraEnabled).not.toHaveBeenCalled()
    expect((await failed({})).controls.microphoneUnavailable).toBe(false)
  })

  it('does not retry a device the person switched off after it failed', async () => {
    const { participant, controls } = await failed({ microphone: notFound })
    controls.declareIntent({ microphoneEnabled: false, cameraEnabled: true })

    expect(await controls.retryUnavailableDevices()).toBe(false)
    expect(participant.setMicrophoneEnabled).not.toHaveBeenCalled()
  })

  it('does not retry while Busy, which keeps both off on purpose', async () => {
    const { participant, controls } = await failed({ microphone: notFound })
    await controls.beginBusy({ microphoneEnabled: true, cameraEnabled: true })
    participant.setMicrophoneEnabled.mockClear()

    expect(await controls.retryUnavailableDevices()).toBe(false)
    expect(participant.setMicrophoneEnabled).not.toHaveBeenCalled()
  })

  it('does not start a second retry while one is still running', async () => {
    const { participant, controls } = await failed({ microphone: notFound })
    let finish!: () => void
    participant.setMicrophoneEnabled.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
      finish = () => resolve(undefined)
    }))

    const first = controls.retryUnavailableDevices()
    expect(await controls.retryUnavailableDevices()).toBe(false)
    finish()
    await first

    expect(participant.setMicrophoneEnabled).toHaveBeenCalledTimes(1)
  })
})

describe('mediaControls switching rooms (issue #264)', () => {
  function twoRooms() {
    const office = createFakeLocalParticipant()
    const priv = createFakeLocalParticipant()
    return { office, priv, officeRoom: createFakeRoom(office), privateRoom: createFakeRoom(priv) }
  }

  it('reads and publishes on the new room after the switch, and leaves the old one alone', async () => {
    const { office, priv, officeRoom, privateRoom } = twoRooms()
    priv.isMicrophoneEnabled = true
    const controls = new MediaControls(officeRoom)

    controls.switchRoom(privateRoom)
    await controls.setMicrophoneEnabled(false)

    expect(controls.microphoneEnabled).toBe(true)
    expect(priv.setMicrophoneEnabled).toHaveBeenCalledExactlyOnceWith(false)
    expect(office.setMicrophoneEnabled).not.toHaveBeenCalled()
  })

  it('keeps what the person asked for: the microphone and camera intent survive the switch (issue #239)', async () => {
    const { officeRoom, privateRoom } = twoRooms()
    const controls = new MediaControls(officeRoom)
    controls.declareIntent({ microphoneEnabled: true, cameraEnabled: false })

    controls.switchRoom(privateRoom)

    expect(controls.microphoneIntent).toBe(true)
    expect(controls.cameraIntent).toBe(false)
  })

  it('keeps Busy across the switch, and ending it restores the snapshot on the new room', async () => {
    const { office, priv, officeRoom, privateRoom } = twoRooms()
    const controls = new MediaControls(officeRoom)
    await controls.beginBusy({ microphoneEnabled: true, cameraEnabled: true })
    office.setMicrophoneEnabled.mockClear()
    office.setCameraEnabled.mockClear()

    controls.switchRoom(privateRoom)
    expect(controls.microphoneIntent).toBe(true)
    expect(controls.cameraIntent).toBe(true)
    await controls.endBusy()

    expect(priv.setMicrophoneEnabled).toHaveBeenCalledExactlyOnceWith(true)
    expect(priv.setCameraEnabled).toHaveBeenCalledExactlyOnceWith(true)
    expect(office.setMicrophoneEnabled).not.toHaveBeenCalled()
  })

  it('is not busy after a switch when it was not busy before', async () => {
    const { priv, officeRoom, privateRoom } = twoRooms()
    const controls = new MediaControls(officeRoom)

    controls.switchRoom(privateRoom)
    await controls.endBusy()

    expect(priv.setMicrophoneEnabled).not.toHaveBeenCalled()
  })

  it('forgets why a device failed in the room it left: the new room starts clean', async () => {
    const { office, officeRoom, privateRoom } = twoRooms()
    office.setMicrophoneEnabled.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    office.setCameraEnabled.mockRejectedValueOnce(Object.assign(new Error('missing'), { name: 'NotFoundError' }))
    const controls = new MediaControls(officeRoom)
    await controls.setMicrophoneEnabled(true)
    await controls.setCameraEnabled(true)
    expect(controls.microphoneUnavailable).toBe(true)
    expect(controls.cameraUnavailable).toBe(true)

    controls.switchRoom(privateRoom)

    expect(controls.microphoneUnavailable).toBe(false)
    expect(controls.cameraUnavailable).toBe(false)
    expect(controls.microphoneFailure).toBeUndefined()
    expect(controls.cameraFailure).toBeUndefined()
  })

  it('puts the screen-share quality and audio choice back to the defaults: a share only crosses rooms by hand-off', async () => {
    const { officeRoom, privateRoom } = twoRooms()
    const controls = new MediaControls(officeRoom)
    await controls.setScreenShareEnabled(true, '2k', true)

    controls.switchRoom(privateRoom)

    expect(controls.screenShareQuality).toBe('1080p')
    expect(controls.screenShareAudio).toBe(false)
  })

  it('still carries a share across with its own quality: detach on the old room, adopt on the new one', async () => {
    const { office, priv, officeRoom, privateRoom } = twoRooms()
    const videoTrack = { kind: 'video' }
    office.publications.set(Track.Source.ScreenShare, { track: videoTrack })
    const controls = new MediaControls(officeRoom)
    await controls.setScreenShareEnabled(true, '720p')

    const handoff = await controls.detachScreenShareTrack()
    controls.switchRoom(privateRoom)
    await controls.adoptScreenShareTrack(handoff!)

    expect(office.unpublishTrack).toHaveBeenCalledWith(videoTrack, false)
    expect(priv.publishTrack).toHaveBeenCalledWith(videoTrack, resolveScreenShareQuality('720p', false).publishOptions)
    expect(controls.screenShareQuality).toBe('720p')
  })

  it('stops listening to the room it left: a late screen-share end from it is ignored, one from the new room is not', () => {
    const { office, priv, officeRoom, privateRoom } = twoRooms()
    const onScreenShareEnded = vi.fn()
    const controls = new MediaControls(officeRoom, onScreenShareEnded)

    controls.switchRoom(privateRoom)
    office.emit(ParticipantEvent.LocalTrackUnpublished, { source: Track.Source.ScreenShare })
    expect(onScreenShareEnded).not.toHaveBeenCalled()

    priv.emit(ParticipantEvent.LocalTrackUnpublished, { source: Track.Source.ScreenShare })
    expect(onScreenShareEnded).toHaveBeenCalledTimes(1)
  })

  it('reports the new room\'s connection quality straight away, and ignores the old room\'s from then on', () => {
    const { office, priv, officeRoom, privateRoom } = twoRooms()
    office.connectionQuality = 'excellent'
    priv.connectionQuality = 'poor'
    const onQuality = vi.fn()
    const controls = new MediaControls(officeRoom, undefined, onQuality)
    expect(onQuality).toHaveBeenLastCalledWith('excellent')

    controls.switchRoom(privateRoom)
    expect(onQuality).toHaveBeenLastCalledWith('poor')

    onQuality.mockClear()
    office.emit(ParticipantEvent.ConnectionQualityChanged, 'lost')
    expect(onQuality).not.toHaveBeenCalled()
    priv.emit(ParticipantEvent.ConnectionQualityChanged, 'good')
    expect(onQuality).toHaveBeenCalledExactlyOnceWith('good')
  })
})
