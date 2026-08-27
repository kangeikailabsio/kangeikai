import type { AvatarState } from '@kangeikai/shared'
import { PUBLIC_LIVEKIT_TOKEN_ENDPOINT } from '$env/static/public'
import { Room } from 'livekit-client'
import { attachRemoteAudioElements } from './attach-remote-audio'
import { fetchLiveKitToken } from './livekit-token-client'
import { proximityVolume } from './proximity-volume'

/** Baked in at build time (adapter-static/SPA — no server to read this at runtime) — see .env.example. */
const DEFAULT_TOKEN_ENDPOINT = PUBLIC_LIVEKIT_TOKEN_ENDPOINT

/**
 * Fixed hearing-range threshold in map pixels (spec.md Assumptions: tuned during
 * implementation, not user-configurable in the MVP) — ~2.5 tiles at feature 001's 32px tiles,
 * tightened from an initial 200px (~6 tiles) so proximity only activates when avatars are
 * genuinely close, not room-wide.
 */
const HEARING_RANGE_PX = 80

export type AvatarPosition = Pick<AvatarState, 'x' | 'y' | 'presence'>

/** Mirrors contracts/livekit-token-endpoint.md's LiveKitTokenRequest. */
export interface ProximityAudioControllerOptions {
  /** MUST equal the participant's Colyseus sessionId (contract's "Stability" section). */
  identity: string
  name: string
  /**
   * `RoomConnection.sessionProof` — proves `identity` came from a real `onJoin` (security
   * review finding: the endpoint used to accept any identity unverified).
   */
  proof: string
}

/**
 * Fetches a scoped token from `/livekit-token` and connects to the single shared LiveKit
 * room. Ambient proximity volume falls off continuously with distance (FR-002/FR-003,
 * FR-012) — there's no separate "zone" concept here any more, since a genuinely isolated
 * conversation is now `PrivateRoomController`'s job instead.
 */
export class ProximityAudioController {
  private readonly room = new Room()
  private readonly tokenEndpoint: string

  constructor(tokenEndpoint: string = DEFAULT_TOKEN_ENDPOINT) {
    this.tokenEndpoint = tokenEndpoint
    attachRemoteAudioElements(this.room)
  }

  /** The underlying LiveKit room, for `MediaControls`/video-overlay callers (US2). */
  get liveKitRoom(): Room {
    return this.room
  }

  /**
   * `_localPosition` exists only to make FR-008 a compile-time precondition — there is no
   * way to call this before the local avatar has a valid position. `update()` takes the
   * current position fresh on every frame instead, so the value itself isn't used here.
   */
  async connect(options: ProximityAudioControllerOptions, _localPosition: AvatarPosition): Promise<void> {
    const { token, url } = await fetchLiveKitToken(this.tokenEndpoint, options)
    await this.room.connect(url, token)
  }

  disconnect(): void {
    void this.room.disconnect()
  }

  /**
   * Called once per local animation frame: matches each connected LiveKit participant's
   * `identity` to their synced avatar position (feature 002), then sets that participant's
   * volume by `proximityVolume` of the distance between them (FR-002/FR-003, FR-012) —
   * data-model.md's `ProximityRelationship.volume` rule.
   *
   * Returns the set of remote `identity`s that are currently audible (volume > 0) — "close
   * enough to hear" is also the video-visibility/muted-indicator condition for US2 (spec.md
   * acceptance scenarios), so callers reuse this instead of recomputing distance themselves.
   */
  update(localPosition: AvatarPosition, remotePositions: ReadonlyMap<string, AvatarPosition>): ReadonlySet<string> {
    const nearby = new Set<string>()

    for (const [identity, participant] of this.room.remoteParticipants) {
      const remotePosition = remotePositions.get(identity)
      if (!remotePosition) {
        continue
      }

      const volume = proximityVolume(Math.hypot(remotePosition.x - localPosition.x, remotePosition.y - localPosition.y), HEARING_RANGE_PX)

      participant.setVolume(volume)
      if (volume > 0) {
        nearby.add(identity)
      }
    }

    return nearby
  }
}
