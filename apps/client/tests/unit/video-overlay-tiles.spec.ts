import type { RemoteVideoOverlayCandidate, VideoOverlayParticipant } from '$lib/av/video-overlay-tiles'
import { isOverflowTile } from '$lib/av/video-overlay-state.svelte'
import { buildVideoOverlayTiles } from '$lib/av/video-overlay-tiles'
import { describe, expect, it } from 'vitest'

const localCameraTile: VideoOverlayParticipant = {
  sessionId: 'local',
  name: 'You',
  kind: 'camera',
  cameraEnabled: true,
  micEnabled: true,
  speaking: false,
  videoTrack: undefined,
}

function remote(sessionId: string, distance: number, kind: 'camera' | 'screen' = 'camera'): RemoteVideoOverlayCandidate {
  return {
    sessionId,
    name: sessionId,
    kind,
    cameraEnabled: false,
    micEnabled: false,
    speaking: false,
    videoTrack: undefined,
    distance,
  }
}

function tileKey(entry: ReturnType<typeof buildVideoOverlayTiles>[number]): string | undefined {
  return isOverflowTile(entry) ? undefined : `${entry.sessionId}:${entry.kind}`
}

describe('buildVideoOverlayTiles', () => {
  it('is empty when there are no remotes, hiding the local tile(s) too', () => {
    expect(buildVideoOverlayTiles([localCameraTile], [], 4)).toEqual([])
  })

  it('puts the local tile(s) first, marked isLocal', () => {
    const entries = buildVideoOverlayTiles([localCameraTile], [remote('a', 10)], 4)

    expect(entries[0]).toMatchObject({ sessionId: 'local', kind: 'camera', isLocal: true })
  })

  it('includes a second local tile when locally sharing (camera never replaced)', () => {
    const localScreenTile: VideoOverlayParticipant = { ...localCameraTile, kind: 'screen' }
    const entries = buildVideoOverlayTiles([localCameraTile, localScreenTile], [remote('a', 10)], 4)

    expect(entries.slice(0, 2).map(tileKey)).toEqual(['local:camera', 'local:screen'])
  })

  it('sorts same-kind remotes by ascending distance', () => {
    const entries = buildVideoOverlayTiles([localCameraTile], [remote('far', 300), remote('near', 10), remote('mid', 100)], 4)

    expect(entries.slice(1).map(tileKey)).toEqual(['near:camera', 'mid:camera', 'far:camera'])
  })

  it('marks remote tiles as not local', () => {
    const entries = buildVideoOverlayTiles([localCameraTile], [remote('a', 10)], 4)

    expect(entries[1]).toMatchObject({ sessionId: 'a', isLocal: false })
  })

  it('prioritizes screen tiles over camera tiles regardless of distance', () => {
    const entries = buildVideoOverlayTiles([localCameraTile], [
      remote('near-camera', 5, 'camera'),
      remote('far-screen', 500, 'screen'),
    ], 4)

    expect(entries.slice(1).map(tileKey)).toEqual(['far-screen:screen', 'near-camera:camera'])
  })

  it('gives the same person both a screen and a camera tile when both are active', () => {
    const entries = buildVideoOverlayTiles([localCameraTile], [
      remote('a', 10, 'camera'),
      remote('a', 10, 'screen'),
    ], 4)

    expect(entries.slice(1).map(tileKey)).toEqual(['a:screen', 'a:camera'])
  })

  it('caps remote tiles at maxRemoteTiles and appends a single overflow tile for the rest', () => {
    const remotes = Array.from({ length: 6 }, (_, i) => remote(`r${i}`, i))
    const entries = buildVideoOverlayTiles([localCameraTile], remotes, 4)

    // local + 4 capped remotes + 1 overflow tile
    expect(entries).toHaveLength(6)
    const overflow = entries.at(-1)!
    expect(isOverflowTile(overflow)).toBe(true)
    expect(overflow).toEqual({ overflowCount: 2 })
  })

  it('drops camera tiles into overflow before any screen tile, when the cap is tight', () => {
    const remotes = [
      remote('cam-a', 1, 'camera'),
      remote('cam-b', 2, 'camera'),
      remote('screen-a', 999, 'screen'),
    ]
    const entries = buildVideoOverlayTiles([localCameraTile], remotes, 2)

    expect(entries.slice(1, 3).map(tileKey)).toEqual(['screen-a:screen', 'cam-a:camera'])
    expect(entries.at(-1)).toEqual({ overflowCount: 1 })
  })

  it('omits the overflow tile when remotes fit within the cap', () => {
    const entries = buildVideoOverlayTiles([localCameraTile], [remote('a', 10), remote('b', 20)], 4)

    expect(entries.some(isOverflowTile)).toBe(false)
    expect(entries).toHaveLength(3)
  })

  it('omits the overflow tile when remotes exactly fill the cap', () => {
    const remotes = Array.from({ length: 4 }, (_, i) => remote(`r${i}`, i))
    const entries = buildVideoOverlayTiles([localCameraTile], remotes, 4)

    expect(entries.some(isOverflowTile)).toBe(false)
    expect(entries).toHaveLength(5)
  })

  it('does not leak the distance field onto the resulting tiles', () => {
    const entries = buildVideoOverlayTiles([localCameraTile], [remote('a', 10)], 4)

    expect(entries[1]).not.toHaveProperty('distance')
  })
})
