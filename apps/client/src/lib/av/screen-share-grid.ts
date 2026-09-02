import type { ScreenShareGridTile } from '$lib/av/screen-share-grid-state.svelte'
import type { VideoOverlayParticipant } from '$lib/av/video-overlay-tiles'

/**
 * Builds the full-screen grid's tile list: every `kind: 'screen'` candidate from `local`
 * and `remotes` — no cap, unlike `buildVideoOverlayTiles`'s strip. Callers pass in the exact
 * same candidate lists already resolved for the strip (visibility/busy filtering, and the
 * camera/screen split, both already applied there) — this just picks out the screen ones.
 */
export function buildScreenShareGridTiles(
  local: readonly VideoOverlayParticipant[],
  remotes: readonly VideoOverlayParticipant[],
): ScreenShareGridTile[] {
  const tiles: ScreenShareGridTile[] = []

  for (const tile of local) {
    if (tile.kind === 'screen') {
      tiles.push({ sessionId: tile.sessionId, name: tile.name, isLocal: true, videoTrack: tile.videoTrack })
    }
  }

  for (const tile of remotes) {
    if (tile.kind === 'screen') {
      tiles.push({ sessionId: tile.sessionId, name: tile.name, isLocal: false, videoTrack: tile.videoTrack })
    }
  }

  return tiles
}
