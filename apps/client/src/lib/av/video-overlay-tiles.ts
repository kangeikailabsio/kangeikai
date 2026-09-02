import type { VideoOverlayEntry, VideoOverlayTile } from '$lib/av/video-overlay-state.svelte'

/** A tile's data before the local/remote split and the priority/distance sort are applied. */
export type VideoOverlayParticipant = Omit<VideoOverlayTile, 'isLocal'>

/** A remote tile candidate, carrying its distance to the local avatar for the closest-first sort. */
export interface RemoteVideoOverlayCandidate extends VideoOverlayParticipant {
  distance: number
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
 * The strip is hidden entirely (including the local tile(s)) when `remotes` is empty — matching
 * `office-scene.ts`'s "only appears once at least one other participant is nearby" rule.
 */
export function buildVideoOverlayTiles(
  local: readonly VideoOverlayParticipant[],
  remotes: readonly RemoteVideoOverlayCandidate[],
  maxRemoteTiles: number,
): VideoOverlayEntry[] {
  if (remotes.length === 0) {
    return []
  }

  const closest = [...remotes].sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === 'screen' ? -1 : 1
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
