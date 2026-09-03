import type { VideoOverlayParticipant } from '$lib/av/video-overlay-tiles'
import { buildScreenShareGridTiles } from '$lib/av/screen-share-grid'
import { describe, expect, it } from 'vitest'

function tile(sessionId: string, kind: 'camera' | 'screen'): VideoOverlayParticipant {
  return {
    sessionId,
    name: sessionId,
    kind,
    cameraEnabled: false,
    micEnabled: false,
    speaking: false,
    videoTrack: undefined,
  }
}

describe('buildScreenShareGridTiles', () => {
  it('is empty when nobody (local or remote) is sharing', () => {
    expect(buildScreenShareGridTiles([tile('local', 'camera')], [tile('a', 'camera')])).toEqual([])
  })

  it('includes the local screen tile, marked isLocal', () => {
    const tiles = buildScreenShareGridTiles([tile('local', 'camera'), tile('local', 'screen')], [])

    expect(tiles).toEqual([{ sessionId: 'local', name: 'local', isLocal: true, videoTrack: undefined }])
  })

  it('includes every remote screen tile, marked not local', () => {
    const tiles = buildScreenShareGridTiles([tile('local', 'camera')], [tile('a', 'camera'), tile('b', 'screen'), tile('c', 'screen')])

    expect(tiles).toEqual([
      { sessionId: 'b', name: 'b', isLocal: false, videoTrack: undefined },
      { sessionId: 'c', name: 'c', isLocal: false, videoTrack: undefined },
    ])
  })

  it('applies no cap, unlike the strip\'s MAX_REMOTE_VIDEO_TILES', () => {
    const remotes = Array.from({ length: 10 }, (_, i) => tile(`r${i}`, 'screen'))

    expect(buildScreenShareGridTiles([tile('local', 'camera')], remotes)).toHaveLength(10)
  })

  it('excludes camera tiles entirely', () => {
    const tiles = buildScreenShareGridTiles([tile('local', 'camera')], [tile('a', 'camera'), tile('b', 'camera')])

    expect(tiles).toEqual([])
  })
})
