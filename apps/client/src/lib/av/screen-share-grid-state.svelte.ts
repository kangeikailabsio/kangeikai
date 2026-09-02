import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client'

/**
 * One tile in the full-screen screen-share grid (#100) — every active screen share nearby,
 * unlike the video strip's `MAX_REMOTE_VIDEO_TILES`-capped `videoOverlayState`
 * (`video-overlay-state.svelte.ts`), this list is never trimmed.
 */
export interface ScreenShareGridTile {
  sessionId: string
  name: string
  isLocal: boolean
  videoTrack: LocalVideoTrack | RemoteVideoTrack | undefined
}

/**
 * Reactive bridge between `OfficeScene` (Phaser, imperative per-frame loop) and the future
 * full-screen overlay component (#100) — `OfficeScene.update()` writes `tiles` every frame via
 * `set()`, alongside `videoOverlayState`, from the same `updateVideoOverlay()` pass.
 */
function createScreenShareGridState() {
  let tiles = $state<ScreenShareGridTile[]>([])

  return {
    get tiles(): ScreenShareGridTile[] {
      return tiles
    },
    set(value: ScreenShareGridTile[]): void {
      tiles = value
    },
  }
}

export const screenShareGridState = createScreenShareGridState()
