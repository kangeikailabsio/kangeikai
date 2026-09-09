import type { Room } from 'livekit-client'
import { attachRemoteAudioElements } from '$lib/av/attach-remote-audio'
import { RoomEvent, Track } from 'livekit-client'
import { afterEach, describe, expect, it, vi } from 'vitest'

interface FakeRoom {
  on: ReturnType<typeof vi.fn>
  emit: (event: string, ...args: unknown[]) => void
}

/** Minimal fake matching what `attachRemoteAudioElements` actually touches on `Room`. */
function createFakeRoom(): FakeRoom {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>()

  return {
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

/** `element.volume` defaults to 1 on a real `HTMLMediaElement`, same as the fake here. */
function createFakeAudioTrack(): { kind: Track.Kind, attach: ReturnType<typeof vi.fn>, detach: ReturnType<typeof vi.fn> } {
  const element = { volume: 1 } as HTMLMediaElement

  return {
    kind: Track.Kind.Audio,
    attach: vi.fn(() => element),
    detach: vi.fn(() => [element]),
  }
}

function stubDocument(): { appendChild: ReturnType<typeof vi.fn> } {
  const body = { appendChild: vi.fn() }
  vi.stubGlobal('document', { body })
  return body
}

describe('attachRemoteAudioElements', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('attaches a subscribed audio track at the browser default volume when no initialVolume is passed', () => {
    stubDocument()
    const room = createFakeRoom()
    attachRemoteAudioElements(room as unknown as Room)

    const track = createFakeAudioTrack()
    room.emit(RoomEvent.TrackSubscribed, track)

    expect(track.attach.mock.results[0].value.volume).toBe(1)
  })

  it('fails closed: attaches at the given initialVolume instead of the browser default (issue #144)', () => {
    stubDocument()
    const room = createFakeRoom()
    attachRemoteAudioElements(room as unknown as Room, 0)

    const track = createFakeAudioTrack()
    room.emit(RoomEvent.TrackSubscribed, track)

    expect(track.attach.mock.results[0].value.volume).toBe(0)
  })

  it('appends the attached element to the document body', () => {
    const body = stubDocument()
    const room = createFakeRoom()
    attachRemoteAudioElements(room as unknown as Room, 0)

    const track = createFakeAudioTrack()
    room.emit(RoomEvent.TrackSubscribed, track)

    expect(body.appendChild).toHaveBeenCalledWith(track.attach.mock.results[0].value)
  })

  it('ignores a subscribed non-audio (video) track', () => {
    const body = stubDocument()
    const room = createFakeRoom()
    attachRemoteAudioElements(room as unknown as Room, 0)

    const videoTrack = { kind: Track.Kind.Video, attach: vi.fn(), detach: vi.fn() }
    room.emit(RoomEvent.TrackSubscribed, videoTrack)

    expect(videoTrack.attach).not.toHaveBeenCalled()
    expect(body.appendChild).not.toHaveBeenCalled()
  })

  it('detaches and removes an unsubscribed audio track\'s elements', () => {
    stubDocument()
    const room = createFakeRoom()
    attachRemoteAudioElements(room as unknown as Room, 0)

    const element = { volume: 0, remove: vi.fn() } as unknown as HTMLMediaElement
    const track = { kind: Track.Kind.Audio, attach: vi.fn(), detach: vi.fn(() => [element]) }
    room.emit(RoomEvent.TrackUnsubscribed, track)

    expect(track.detach).toHaveBeenCalledOnce()
    expect(element.remove).toHaveBeenCalledOnce()
  })
})
