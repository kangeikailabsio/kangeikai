import type { RemoteVideoOverlayCandidate, VideoOverlayParticipant } from '$lib/av/video-overlay-tiles'
import { isOverflowTile } from '$lib/av/video-overlay-state.svelte'
import { buildVideoOverlayTiles } from '$lib/av/video-overlay-tiles'
import { describe, expect, it } from 'vitest'

const local: VideoOverlayParticipant = {
  sessionId: 'local',
  name: 'You',
  cameraEnabled: true,
  micEnabled: true,
  speaking: false,
  videoTrack: undefined,
}

function remote(sessionId: string, distance: number): RemoteVideoOverlayCandidate {
  return {
    sessionId,
    name: sessionId,
    cameraEnabled: false,
    micEnabled: false,
    speaking: false,
    videoTrack: undefined,
    distance,
  }
}

describe('buildVideoOverlayTiles', () => {
  it('is empty when there are no remotes, hiding the local tile too', () => {
    expect(buildVideoOverlayTiles(local, [], 4)).toEqual([])
  })

  it('puts the local participant first, marked isLocal', () => {
    const entries = buildVideoOverlayTiles(local, [remote('a', 10)], 4)

    expect(entries[0]).toMatchObject({ sessionId: 'local', isLocal: true })
  })

  it('sorts remotes by ascending distance', () => {
    const entries = buildVideoOverlayTiles(local, [remote('far', 300), remote('near', 10), remote('mid', 100)], 4)

    expect(entries.slice(1).map(entry => 'sessionId' in entry ? entry.sessionId : undefined)).toEqual(['near', 'mid', 'far'])
  })

  it('marks remote tiles as not local', () => {
    const entries = buildVideoOverlayTiles(local, [remote('a', 10)], 4)

    expect(entries[1]).toMatchObject({ sessionId: 'a', isLocal: false })
  })

  it('caps remote tiles at maxRemoteTiles and appends a single overflow tile for the rest', () => {
    const remotes = Array.from({ length: 6 }, (_, i) => remote(`r${i}`, i))
    const entries = buildVideoOverlayTiles(local, remotes, 4)

    // local + 4 capped remotes + 1 overflow tile
    expect(entries).toHaveLength(6)
    const overflow = entries.at(-1)!
    expect(isOverflowTile(overflow)).toBe(true)
    expect(overflow).toEqual({ overflowCount: 2 })
  })

  it('omits the overflow tile when remotes fit within the cap', () => {
    const entries = buildVideoOverlayTiles(local, [remote('a', 10), remote('b', 20)], 4)

    expect(entries.some(isOverflowTile)).toBe(false)
    expect(entries).toHaveLength(3)
  })

  it('omits the overflow tile when remotes exactly fill the cap', () => {
    const remotes = Array.from({ length: 4 }, (_, i) => remote(`r${i}`, i))
    const entries = buildVideoOverlayTiles(local, remotes, 4)

    expect(entries.some(isOverflowTile)).toBe(false)
    expect(entries).toHaveLength(5)
  })

  it('does not leak the distance field onto the resulting tiles', () => {
    const entries = buildVideoOverlayTiles(local, [remote('a', 10)], 4)

    expect(entries[1]).not.toHaveProperty('distance')
  })
})
