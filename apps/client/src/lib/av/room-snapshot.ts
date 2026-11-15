import type { LocalVideoTrack, RemoteVideoTrack, Room } from 'livekit-client'
import { Track } from 'livekit-client'

/** One person in a call as the tile rules see them: plain data, tracks passed through untouched. */
export interface ParticipantSnapshot {
  sessionId: string
  name: string
  cameraEnabled: boolean
  micEnabled: boolean
  speaking: boolean
  cameraTrack: LocalVideoTrack | RemoteVideoTrack | undefined
  screenTrack: LocalVideoTrack | RemoteVideoTrack | undefined
}

/** A LiveKit room as the tile rules see it: the local person, and who else is connected. */
export interface RoomSnapshot {
  local: ParticipantSnapshot
  remotes: ReadonlyMap<string, ParticipantSnapshot>
}

/**
 * Reads what the call strip needs out of a LiveKit room, so the rules that decide which tiles show
 * never touch the SDK (issue #274): the only place that knows `Track.Source` for it.
 */
export function snapshotRoom(room: Room): RoomSnapshot {
  const { localParticipant } = room
  const remotes = new Map<string, ParticipantSnapshot>()
  for (const [sessionId, participant] of room.remoteParticipants) {
    remotes.set(sessionId, {
      sessionId,
      name: participant.name || sessionId,
      cameraEnabled: participant.isCameraEnabled,
      micEnabled: participant.isMicrophoneEnabled,
      speaking: participant.isSpeaking,
      cameraTrack: participant.getTrackPublication(Track.Source.Camera)?.track as RemoteVideoTrack | undefined,
      screenTrack: participant.getTrackPublication(Track.Source.ScreenShare)?.track as RemoteVideoTrack | undefined,
    })
  }
  return {
    local: {
      sessionId: localParticipant.identity,
      name: localParticipant.name ?? 'You',
      cameraEnabled: localParticipant.isCameraEnabled,
      micEnabled: localParticipant.isMicrophoneEnabled,
      speaking: localParticipant.isSpeaking,
      cameraTrack: localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined,
      screenTrack: localParticipant.getTrackPublication(Track.Source.ScreenShare)?.track as LocalVideoTrack | undefined,
    },
    remotes,
  }
}
