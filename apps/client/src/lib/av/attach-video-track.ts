import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client'
import type { Action } from 'svelte/action'

/**
 * Attaches/detaches a LiveKit video track to a `<video>` element as the track prop changes —
 * shared between `avatar-video-overlay.svelte` (the strip) and `screen-share-overlay.svelte`
 * (the full-screen grid, #100), which both render LiveKit video tracks the same way.
 */
export const attachVideoTrack: Action<HTMLVideoElement, LocalVideoTrack | RemoteVideoTrack | undefined> = (node, track) => {
  track?.attach(node)
  return {
    update(nextTrack) {
      if (nextTrack === track) {
        return
      }
      track?.detach(node)
      nextTrack?.attach(node)
      track = nextTrack
    },
    destroy() {
      track?.detach(node)
    },
  }
}
