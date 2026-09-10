import type { VideoOverlayEntry, VideoOverlayErrorTile, VideoOverlayPendingTile, VideoOverlayTile } from '$lib/av/video-overlay-state.svelte'

/** A remote candidate's data before the priority/distance sort — a real tile-in-waiting, or one still connecting (issue #141's pending placeholder). Never the error variant — see VideoOverlayErrorTile's docs on why that failure isn't propagated to remotes. */
export type RemoteVideoOverlayParticipant = Omit<VideoOverlayTile, 'isLocal'> | Omit<VideoOverlayPendingTile, 'isLocal'>

/**
 * A tile's data before the local/remote split is applied — everything a remote candidate can be
 * (see `RemoteVideoOverlayParticipant`), plus, local-only, the local person's own private-room
 * connection attempt failing (issue #142).
 */
export type VideoOverlayParticipant = RemoteVideoOverlayParticipant | Omit<VideoOverlayErrorTile, 'isLocal'>

/** A remote tile candidate, carrying its distance to the local avatar for the closest-first sort. */
export type RemoteVideoOverlayCandidate = RemoteVideoOverlayParticipant & { distance: number }

/** A pending candidate has no `kind` of its own — sorts alongside camera tiles, never ahead of a real screen share. */
function tileKind(tile: VideoOverlayParticipant): 'camera' | 'screen' {
  return 'kind' in tile ? tile.kind : 'camera'
}

/**
 * Builds the video strip's tile list: the local tile(s) first (always "You"'s camera tile,
 * plus a second "You" screen tile when locally sharing), then the `maxRemoteTiles` closest
 * remote tiles — `kind: 'screen'` tiles ahead of `kind: 'camera'` ones, closest-first within
 * each group — then a single overflow tile for any remainder. Callers resolve visibility
 * (nearby set), busy filtering, and the camera/screen tile split before calling this — `remotes`
 * is expected to already be the exact set of tile candidates to consider (up to two per person:
 * one `camera` tile, one `screen` tile when that person is sharing).
 *
 * The strip is hidden entirely when `remotes` is empty AND the local person isn't sharing their
 * screen — matching `office-scene.ts`'s "only appears once at least one other participant is
 * nearby" rule for camera-only tiles. A lone local screen-share tile is the exception: with
 * nobody nearby to fill the strip, it's still shown (and only it — the local camera tile stays
 * hidden too) purely as the one way back into the full-screen overlay after minimizing it (#100)
 * — otherwise a lone presenter would have no way to reopen their own share.
 */
export function buildVideoOverlayTiles(
  local: readonly VideoOverlayParticipant[],
  remotes: readonly RemoteVideoOverlayCandidate[],
  maxRemoteTiles: number,
): VideoOverlayEntry[] {
  const localScreenTiles = local.filter(tile => tileKind(tile) === 'screen')

  if (remotes.length === 0) {
    return localScreenTiles.map(tile => ({ ...tile, isLocal: true }))
  }

  const closest = [...remotes].sort((a, b) => {
    const kindA = tileKind(a)
    const kindB = tileKind(b)
    if (kindA !== kindB) {
      return kindA === 'screen' ? -1 : 1
    }
    return a.distance - b.distance
  })

  const entries: VideoOverlayEntry[] = local.map(tile => ({ ...tile, isLocal: true }))

  for (const { distance: _distance, ...tile } of closest.slice(0, maxRemoteTiles)) {
    entries.push({ ...tile, isLocal: false })
  }

  const overflowCount = closest.length - maxRemoteTiles
  if (overflowCount > 0) {
    entries.push({ overflowCount })
  }

  return entries
}
