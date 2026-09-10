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

/**
 * A tile still connecting (issue #141) — the private room's LiveKit connection hasn't
 * propagated a `RemoteParticipant` for this occupant yet, or (when `isLocal`) the local
 * person's own `getUserMedia`/media-controls setup hasn't resolved yet. Renders in the tile's
 * own eventual position — progressive reveal into a real `VideoOverlayTile` once ready, not a
 * separate banner or list.
 */
export interface VideoOverlayPendingTile {
  sessionId: string
  name: string
  isLocal: boolean
  pending: true
}

/**
 * The local person's own private-room connection attempt failed (issue #142) — either
 * `fetchLiveKitToken` or `room.connect` itself. `isLocal` is a `true` literal (not `boolean`):
 * per the issue's scope, a remote participant's connection failure has no propagation mechanism
 * and stays indistinguishable from "still connecting" (`VideoOverlayPendingTile`) to everyone
 * else — only the local person's own failure is ever visible, and only to them.
 */
export interface VideoOverlayErrorTile {
  sessionId: string
  name: string
  isLocal: true
  error: true
}

export type VideoOverlayEntry = VideoOverlayTile | VideoOverlayPendingTile | VideoOverlayErrorTile | VideoOverlayOverflowTile

export function isOverflowTile(entry: VideoOverlayEntry): entry is VideoOverlayOverflowTile {
  return 'overflowCount' in entry
}

export function isPendingTile(entry: VideoOverlayEntry): entry is VideoOverlayPendingTile {
  return 'pending' in entry
}

export function isErrorTile(entry: VideoOverlayEntry): entry is VideoOverlayErrorTile {
  return 'error' in entry
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
