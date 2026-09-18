import type { AvatarState } from '@kangeikai/shared'
import { PUBLIC_LIVEKIT_TOKEN_ENDPOINT } from '$env/static/public'
import { Room, Track } from 'livekit-client'
import { attachRemoteAudioElements } from './attach-remote-audio'
import { busyProximityVolume } from './busy-proximity-volume'
import { fetchLiveKitToken } from './livekit-token-client'
import { resolveProximityHysteresis } from './proximity-hysteresis'

/** Baked in at build time (adapter-static/SPA — no server to read this at runtime) — see .env.example. */
const DEFAULT_TOKEN_ENDPOINT = PUBLIC_LIVEKIT_TOKEN_ENDPOINT

/**
 * Fixed hearing-range threshold in map pixels (spec.md Assumptions: tuned during
 * implementation, not user-configurable in the MVP) — ~2.5 tiles at feature 001's 32px tiles,
 * tightened from an initial 200px (~6 tiles) so proximity only activates when avatars are
 * genuinely close, not room-wide.
 */
const HEARING_RANGE_PX = 80
/**
 * Once someone counts as "nearby", they only drop out past this wider distance (hysteresis —
 * see `resolveProximityHysteresis`) instead of the instant they cross `HEARING_RANGE_PX` again —
 * without this, proximity chat flickered on/off whenever distance hovered right at that single
 * threshold (most visible following someone with "Follow", #160, whose chase naturally settles
 * close to the boundary, but not exclusive to it).
 */
const STAY_NEARBY_RANGE_PX = 100

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
  /** Hysteresis state (see `resolveProximityHysteresis`) — who counted as nearby as of the last `update()` call. */
  private readonly nearbyIdentities = new Set<string>()

  constructor(tokenEndpoint: string = DEFAULT_TOKEN_ENDPOINT) {
    this.tokenEndpoint = tokenEndpoint
    // Fail closed (issue #144): a freshly (re)connected participant starts silent instead of at
    // the browser default full volume, until this class's own per-frame `update()` below sets
    // the real distance/busy-based volume.
    attachRemoteAudioElements(this.room, 0)
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
   * volume by `busyProximityVolume` of the distance between them (FR-002/FR-003, FR-012)
   * with busy isolation — either side `busy` yields volume 0 regardless of distance. Whether
   * someone is "nearby" at all uses `resolveProximityHysteresis` rather than a single hard
   * `HEARING_RANGE_PX` cutoff, so hovering right at the edge (e.g. while using "Follow", #160)
   * doesn't flicker the connection on and off — once nearby, `busyProximityVolume` itself falls
   * off over the wider `STAY_NEARBY_RANGE_PX` too, so volume keeps fading smoothly through that
   * margin instead of jumping.
   *
   * Returns the set of remote `identity`s that currently count as nearby — also the video-
   * visibility/muted-indicator condition for US2 (spec.md acceptance scenarios), so callers
   * reuse this instead of recomputing distance themselves. Busy identities are still included
   * here (distance-nearby, just volume-suppressed) — `updateVideoOverlay` filters busy out itself.
   */
  update(localPosition: AvatarPosition, remotePositions: ReadonlyMap<string, AvatarPosition>): ReadonlySet<string> {
    // Drop hysteresis state for anyone no longer connected, so it can't linger indefinitely.
    for (const identity of this.nearbyIdentities) {
      if (!this.room.remoteParticipants.has(identity)) {
        this.nearbyIdentities.delete(identity)
      }
    }

    const nearby = new Set<string>()

    for (const [identity, participant] of this.room.remoteParticipants) {
      const remotePosition = remotePositions.get(identity)
      if (!remotePosition) {
        continue
      }

      const distance = Math.hypot(remotePosition.x - localPosition.x, remotePosition.y - localPosition.y)
      const isNearby = resolveProximityHysteresis(distance, this.nearbyIdentities.has(identity), HEARING_RANGE_PX, STAY_NEARBY_RANGE_PX)
      const volume = isNearby
        ? busyProximityVolume(distance, STAY_NEARBY_RANGE_PX, localPosition.presence, remotePosition.presence)
        : 0

      // Mic defaults implicitly to `Track.Source.Microphone`; screen-share audio (issue #113)
      // needs its own explicit call. Both are no-ops on the SDK side when that participant has
      // no publication for the given source, so this is safe even when they aren't sharing audio.
      participant.setVolume(volume)
      participant.setVolume(volume, Track.Source.ScreenShareAudio)

      if (isNearby) {
        nearby.add(identity)
        this.nearbyIdentities.add(identity)
      }
      else {
        this.nearbyIdentities.delete(identity)
      }
    }

    return nearby
  }
}
