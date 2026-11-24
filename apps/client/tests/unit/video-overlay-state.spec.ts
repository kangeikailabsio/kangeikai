import type { VideoOverlayEntry, VideoOverlayTile } from '$lib/av/video-overlay-state.svelte'
import type { LocalVideoTrack } from 'livekit-client'
import { videoOverlayState } from '$lib/av/video-overlay-state.svelte'
import { beforeEach, describe, expect, it } from 'vitest'

const track = { id: 'a' } as unknown as LocalVideoTrack

function camera(sessionId: string, overrides: Partial<VideoOverlayTile> = {}): VideoOverlayTile {
  return { sessionId, name: sessionId, isLocal: false, kind: 'camera', cameraEnabled: true, micEnabled: true, speaking: false, videoTrack: track, ...overrides }
}

/** One of each kind of entry the strip can hold. */
function strip(): VideoOverlayEntry[] {
  return [
    camera('me', { isLocal: true }),
    { sessionId: 'p', name: 'Pat', isLocal: false, pending: true },
    { sessionId: 'e', name: 'Me', isLocal: true, error: true },
    { overflowCount: 2 },
  ]
}

describe('videoOverlayState (issue #292)', () => {
  beforeEach(() => videoOverlayState.set([]))

  it('keeps the current entries when the same ones arrive in new objects, of every kind', () => {
    videoOverlayState.set(strip())
    const before = videoOverlayState.tiles

    videoOverlayState.set(strip())

    expect(videoOverlayState.tiles).toBe(before)
  })

  it.each([
    ['a speaking change', (s: VideoOverlayEntry[]) => [{ ...s[0], speaking: true }, ...s.slice(1)]],
    ['a camera toggle', (s: VideoOverlayEntry[]) => [{ ...s[0], cameraEnabled: false }, ...s.slice(1)]],
    ['a mic toggle', (s: VideoOverlayEntry[]) => [{ ...s[0], micEnabled: false }, ...s.slice(1)]],
    ['a new track', (s: VideoOverlayEntry[]) => [{ ...s[0], videoTrack: { id: 'b' } as unknown as LocalVideoTrack }, ...s.slice(1)]],
    ['a different overflow count', (s: VideoOverlayEntry[]) => [...s.slice(0, 3), { overflowCount: 3 }]],
    ['a pending tile that became a camera tile', (s: VideoOverlayEntry[]) => [s[0], camera('p'), ...s.slice(2)]],
    ['a removed entry', (s: VideoOverlayEntry[]) => s.slice(0, 3)],
    ['a different order', (s: VideoOverlayEntry[]) => [s[1], s[0], ...s.slice(2)]],
  ])('replaces the entries on %s', (_, change) => {
    videoOverlayState.set(strip())
    const before = videoOverlayState.tiles

    videoOverlayState.set(change(strip()))

    expect(videoOverlayState.tiles).not.toBe(before)
  })

  it('still runs the retry handler of the error tile', () => {
    let retried = 0
    videoOverlayState.setRetryHandler(() => retried++)

    videoOverlayState.retryPrivateRoomConnection()

    expect(retried).toBe(1)
    videoOverlayState.setRetryHandler(null)
  })
})
