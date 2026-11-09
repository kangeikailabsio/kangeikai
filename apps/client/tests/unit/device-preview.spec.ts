import type { PreviewSnapshot } from '$lib/av/devices/device-preview'
import { DevicePreview } from '$lib/av/devices/device-preview'
import { describe, expect, it, vi } from 'vitest'

const named = (name: string) => Object.assign(new Error(name), { name })

function fakeTrack(kind: 'audio' | 'video', deviceId = `${kind}-default`) {
  return {
    kind,
    stop: vi.fn(),
    mediaStreamTrack: { getSettings: () => ({ deviceId }) },
  }
}

type FakeTrack = ReturnType<typeof fakeTrack>

/** A `createLocalTracks` that hands out one fake track per kind asked for, in the order audio, video. */
function createStack(options: { choice?: { audioinput?: string, videoinput?: string }, fail?: Partial<Record<'audio' | 'video' | 'both', string>> } = {}) {
  const created: FakeTrack[] = []
  const calls: Array<{ audio?: unknown, video?: unknown }> = []
  const events: string[] = []
  const saved: Array<[string, string]> = []
  const createTracks = vi.fn(async (request: { audio?: unknown, video?: unknown }) => {
    calls.push(request)
    events.push(`capture:${request.audio ? 'audio' : ''}${request.audio && request.video ? '+' : ''}${request.video ? 'video' : ''}`)
    if (request.audio && request.video && options.fail?.both)
      throw named(options.fail.both)
    if (request.audio && options.fail?.audio)
      throw named(options.fail.audio)
    if (request.video && options.fail?.video)
      throw named(options.fail.video)
    const tracks: FakeTrack[] = []
    if (request.audio)
      tracks.push(fakeTrack('audio', (request.audio as { deviceId?: string }).deviceId))
    if (request.video)
      tracks.push(fakeTrack('video', (request.video as { deviceId?: string }).deviceId))
    for (const track of tracks)
      track.stop.mockImplementation(() => { events.push(`stop:${track.kind}`) })
    created.push(...tracks)
    return tracks
  })
  const snapshots: PreviewSnapshot[] = []
  const preview = new DevicePreview({
    createTracks: createTracks as never,
    loadChoice: () => options.choice ?? {},
    saveChoice: (kind, id) => { saved.push([kind, id]) },
  }, snapshot => snapshots.push(snapshot))
  return { preview, createTracks, created, calls, events, saved, snapshots }
}

describe('devicePreview (issue #246)', () => {
  it('starts the microphone and the camera with a single request, so the browser asks once', async () => {
    const { preview, createTracks } = createStack()

    await preview.start()

    expect(createTracks).toHaveBeenCalledOnce()
    expect(preview.snapshot().microphone.status).toBe('on')
    expect(preview.snapshot().camera.status).toBe('on')
    expect(preview.intent()).toEqual({ microphoneEnabled: true, cameraEnabled: true })
  })

  it('asks for the saved devices, and for any device when nothing was saved', async () => {
    const saved = createStack({ choice: { audioinput: 'mic-2', videoinput: 'cam-9' } })
    await saved.preview.start()
    expect(saved.calls[0]).toEqual({ audio: { deviceId: 'mic-2' }, video: { deviceId: 'cam-9' } })

    const fresh = createStack()
    await fresh.preview.start()
    expect(fresh.calls[0]).toEqual({ audio: true, video: true })
  })

  it('finds out which device failed when the single request fails, and keeps the other working', async () => {
    const { preview } = createStack({ fail: { both: 'NotFoundError', video: 'NotFoundError' } })

    await preview.start()

    expect(preview.snapshot().microphone.status).toBe('on')
    expect(preview.snapshot().camera.status).toBe('not-found')
  })

  it('reports a blocked permission on both devices', async () => {
    const { preview } = createStack({ fail: { both: 'NotAllowedError', audio: 'NotAllowedError', video: 'NotAllowedError' } })

    await preview.start()

    expect(preview.snapshot().microphone.status).toBe('blocked')
    expect(preview.snapshot().camera.status).toBe('blocked')
  })

  it('still counts a failed device as wanted: the person enters trying to use it', async () => {
    const { preview } = createStack({ fail: { both: 'NotReadableError', audio: 'NotReadableError', video: 'NotReadableError' } })

    await preview.start()

    expect(preview.snapshot().camera.status).toBe('in-use')
    expect(preview.intent()).toEqual({ microphoneEnabled: true, cameraEnabled: true })
  })

  it('turning the camera off stops its track (the camera light goes off) and leaves the microphone alone', async () => {
    const { preview, created } = createStack()
    await preview.start()

    await preview.setWanted('camera', false)

    expect(created.find(track => track.kind === 'video')!.stop).toHaveBeenCalledOnce()
    expect(created.find(track => track.kind === 'audio')!.stop).not.toHaveBeenCalled()
    expect(preview.snapshot().camera.status).toBe('off')
    expect(preview.intent()).toEqual({ microphoneEnabled: true, cameraEnabled: false })
  })

  it('turning a device back on captures it again', async () => {
    const { preview, createTracks } = createStack()
    await preview.start()
    await preview.setWanted('microphone', false)

    await preview.setWanted('microphone', true)

    expect(createTracks).toHaveBeenCalledTimes(2)
    expect(preview.snapshot().microphone.status).toBe('on')
  })

  it('switching to another device releases the old one before capturing the new one, and remembers the choice', async () => {
    const { preview, events, saved, calls } = createStack()
    await preview.start()
    events.length = 0

    await preview.selectDevice('audioinput', 'mic-2')

    expect(saved).toEqual([['audioinput', 'mic-2']])
    expect(events).toEqual(['stop:audio', 'capture:audio'])
    expect(calls.at(-1)).toEqual({ audio: { deviceId: 'mic-2' } })
    expect(preview.activeDeviceId('audioinput')).toBe('mic-2')
  })

  it('only remembers the device when it is switched off: it applies when turned on', async () => {
    const { preview, createTracks, saved } = createStack({ choice: {} })
    await preview.start()
    await preview.setWanted('camera', false)
    createTracks.mockClear()

    await preview.selectDevice('videoinput', 'cam-9')

    expect(saved).toEqual([['videoinput', 'cam-9']])
    expect(createTracks).not.toHaveBeenCalled()
  })

  it('stop() releases every device, keeps what the person wanted, and may be called again', async () => {
    const { preview, created } = createStack()
    await preview.start()

    preview.stop()
    preview.stop()

    for (const track of created)
      expect(track.stop).toHaveBeenCalledOnce()
    expect(preview.snapshot().microphone.status).toBe('off')
    expect(preview.intent()).toEqual({ microphoneEnabled: true, cameraEnabled: true })
  })

  it('does not capture while released, and start() brings back what is wanted', async () => {
    const { preview, createTracks } = createStack()
    await preview.start()
    preview.stop()
    createTracks.mockClear()

    await preview.setWanted('camera', true)
    expect(createTracks).not.toHaveBeenCalled()

    await preview.start()
    expect(createTracks).toHaveBeenCalledOnce()
    expect(preview.snapshot().camera.status).toBe('on')
  })

  it('discards a capture that finishes after stop(), so no device is left on', async () => {
    const track = fakeTrack('audio')
    let finish!: (tracks: unknown[]) => void
    const preview = new DevicePreview({
      createTracks: (() => new Promise((resolve) => { finish = resolve as never })) as never,
      loadChoice: () => ({}),
      saveChoice: () => {},
    }, () => {})
    const starting = preview.start()

    preview.stop()
    finish([track])
    await starting

    expect(track.stop).toHaveBeenCalledOnce()
    expect(preview.snapshot().microphone.track).toBeUndefined()
  })

  it('discards a capture for a device that was switched off while it was starting', async () => {
    const video = fakeTrack('video')
    let finish!: (tracks: unknown[]) => void
    const preview = new DevicePreview({
      createTracks: (() => new Promise((resolve) => { finish = resolve as never })) as never,
      loadChoice: () => ({}),
      saveChoice: () => {},
    }, () => {})
    const starting = preview.start()

    await preview.setWanted('camera', false)
    finish([video])
    await starting

    expect(video.stop).toHaveBeenCalledOnce()
    expect(preview.snapshot().camera).toMatchObject({ wanted: false, status: 'off', track: undefined })
  })

  it('tells the listener after every change', async () => {
    const { preview, snapshots } = createStack()

    await preview.start()
    const afterStart = snapshots.length
    await preview.setWanted('camera', false)

    expect(afterStart).toBeGreaterThan(0)
    expect(snapshots.length).toBeGreaterThan(afterStart)
    expect(snapshots.at(-1)!.camera.status).toBe('off')
  })
})
