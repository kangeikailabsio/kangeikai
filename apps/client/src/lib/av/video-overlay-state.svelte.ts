import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client'

/**
 * One video-strip tile's view-model, refreshed every frame — always includes the local
 * participant ("You") plus the closest nearby remote participants (capped, see
 * `office-scene.ts`'s `MAX_REMOTE_VIDEO_TILES`), camera on or off (a camera-off tile still
 * renders a placeholder, per spec.md's US2 acceptance scenarios treating "nearby" as the
 * visibility gate, not camera state). A person sharing their screen gets a *second*, separate
 * `kind: 'screen'` tile alongside their `kind: 'camera'` one — screen share never replaces the
 * camera tile (#94's grill Q6) — with `videoTrack` pointing at whichever track that tile shows.
 * `kind: 'screen'` tiles are prioritized over `kind: 'camera'` ones when the cap trims the strip
 * (`video-overlay-tiles.ts`'s `buildVideoOverlayTiles`).
 */
export interface VideoOverlayTile {
  sessionId: string
  name: string
  isLocal: boolean
  kind: 'camera' | 'screen'
  cameraEnabled: boolean
  micEnabled: boolean
  /**
   * LiveKit's built-in active-speaker detection (`Participant.isSpeaking`) — drives the
   * speaking-indicator border, Gather-style.
   */
  speaking: boolean
  videoTrack: LocalVideoTrack | RemoteVideoTrack | undefined
}

/**
 * Appended after the capped remote tiles when more nearby participants exist than fit
 * (`office-scene.ts`'s `MAX_REMOTE_VIDEO_TILES`) — the overflow ones are still audible
 * (`ProximityAudioController` volume is unaffected by this cap), just not shown as a tile.
 */
export interface VideoOverlayOverflowTile {
  overflowCount: number
}

export type VideoOverlayEntry = VideoOverlayTile | VideoOverlayOverflowTile

export function isOverflowTile(entry: VideoOverlayEntry): entry is VideoOverlayOverflowTile {
  return 'overflowCount' in entry
}

/**
 * Reactive bridge between `OfficeScene` (Phaser, imperative per-frame loop) and
 * `avatar-video-overlay.svelte` (declarative DOM overlay) — `OfficeScene.update()` writes
 * `tiles` every frame via `set()`; the component reads it reactively via the `tiles` getter.
 */
function createVideoOverlayState() {
  let tiles = $state<VideoOverlayEntry[]>([])

  return {
    get tiles(): VideoOverlayEntry[] {
      return tiles
    },
    set(value: VideoOverlayEntry[]): void {
      tiles = value
    },
  }
}

export const videoOverlayState = createVideoOverlayState()
