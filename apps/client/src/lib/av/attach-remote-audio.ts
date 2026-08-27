import type { Room } from 'livekit-client'
import { RoomEvent, Track } from 'livekit-client'

/**
 * Remote audio tracks are silent until something calls `.attach()` — LiveKit never plays a
 * track until something in the app does. Audio has no visual surface of its own, so it's
 * attached centrally here (to the document body) rather than through per-frame video-tile UI.
 * Shared by every controller that owns a LiveKit `Room` (`ProximityAudioController`,
 * `PrivateRoomController`).
 */
export function attachRemoteAudioElements(room: Room): void {
  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Audio) {
      document.body.appendChild(track.attach())
    }
  })
  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    if (track.kind === Track.Kind.Audio) {
      track.detach().forEach(element => element.remove())
    }
  })
}
