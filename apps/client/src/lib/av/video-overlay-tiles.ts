import type { VideoOverlayEntry, VideoOverlayTile } from '$lib/av/video-overlay-state.svelte'

/** A participant's tile data before the local/remote split and distance sort are applied. */
export type VideoOverlayParticipant = Omit<VideoOverlayTile, 'isLocal'>

/** A remote candidate, carrying its distance to the local avatar for the closest-first sort. */
export interface RemoteVideoOverlayCandidate extends VideoOverlayParticipant {
  distance: number
}

/**
 * Builds the video strip's tile list: the local participant first, then the
 * `maxRemoteTiles` closest remotes (closest-first), then a single overflow tile for any
 * remainder. Callers resolve visibility (nearby set) and busy filtering before calling this —
 * `remotes` is expected to already be the exact set that should be considered for a tile.
 *
 * The strip is hidden entirely (including the local tile) when `remotes` is empty — matching
 * `office-scene.ts`'s "only appears once at least one other participant is nearby" rule.
 */
export function buildVideoOverlayTiles(
  local: VideoOverlayParticipant,
  remotes: readonly RemoteVideoOverlayCandidate[],
  maxRemoteTiles: number,
): VideoOverlayEntry[] {
  if (remotes.length === 0) {
    return []
  }

  const closest = [...remotes].sort((a, b) => a.distance - b.distance)

  const entries: VideoOverlayEntry[] = [{ ...local, isLocal: true }]

  for (const { distance: _distance, ...tile } of closest.slice(0, maxRemoteTiles)) {
    entries.push({ ...tile, isLocal: false })
  }

  const overflowCount = closest.length - maxRemoteTiles
  if (overflowCount > 0) {
    entries.push({ overflowCount })
  }

  return entries
}
