import type { Room } from 'livekit-client'
import { RoomEvent, Track } from 'livekit-client'

/**
 * Remote audio tracks are silent until something calls `.attach()` — LiveKit never plays a
 * track until something in the app does. Audio has no visual surface of its own, so it's
 * attached centrally here (to the document body) rather than through per-frame video-tile UI.
 * Shared by every controller that owns a LiveKit `Room` (`ProximityAudioController`,
 * `PrivateRoomController`).
 *
 * `initialVolume` fails closed for `ProximityAudioController` (issue #144): a freshly
 * (re)connected participant's track would otherwise play at the browser default (1.0) for one
 * frame before `ProximityAudioController.update()` applies the real distance/busy volume,
 * audible regardless of actual distance or busy state — worse the longer that correction is
 * delayed (e.g. a backgrounded listener tab throttling its render loop). Defaulting to silent
 * means the worst case becomes "audio takes a moment to start", never "audio leaks".
 *
 * `PrivateRoomController` keeps the parameter's default (`1`) — there's no proximity/busy
 * gating inside a private room, so its audio should stay immediately audible.
 */
export function attachRemoteAudioElements(room: Room, initialVolume = 1): void {
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Audio) {
      const element = track.attach()
      element.volume = initialVolume
      document.body.appendChild(element)
    }
  })
  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    if (track.kind === Track.Kind.Audio) {
      track.detach().forEach(element => element.remove())
    }
  })
}
