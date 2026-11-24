import type { Room } from 'livekit-client'
import type { DeviceChoice } from './device-choice-store'

/**
 * Points a room's next microphone and camera capture, and its audio playback, at the chosen devices. Every switch between
 * the office and a private room creates a capture of its own on a different `Room`, and a `Room`
 * only uses a device it was told about, so the choice has to be applied to each one (issue #245).
 * A kind with no choice is left alone: the browser's default stays. LiveKit's own
 * `switchActiveDevice` writes the same options, so this is the same mechanism before a room has
 * a track to switch.
 */
export function applyDeviceChoice(room: Pick<Room, 'options'>, choice: DeviceChoice): void {
  if (choice.audioinput)
    room.options.audioCaptureDefaults = { ...room.options.audioCaptureDefaults, deviceId: choice.audioinput }
  if (choice.videoinput)
    room.options.videoCaptureDefaults = { ...room.options.videoCaptureDefaults, deviceId: choice.videoinput }
  // Read by LiveKit when it connects and for every participant that joins later, so the remote audio
  // of each room plays on it (issue #299).
  if (choice.audiooutput)
    room.options.audioOutput = { ...room.options.audioOutput, deviceId: choice.audiooutput }
}
