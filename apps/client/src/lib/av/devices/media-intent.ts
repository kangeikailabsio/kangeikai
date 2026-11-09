/**
 * Whether the person wants their microphone and camera on: what the switches on the entry screen
 * say, and what the room starts with (issue #246). The same shape `MediaControls` calls its
 * "intent" (issue #239).
 */
export interface MediaIntent {
  microphoneEnabled: boolean
  cameraEnabled: boolean
}
