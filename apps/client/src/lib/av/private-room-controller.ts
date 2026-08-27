import type { PrivateZone } from '$lib/game/map/private-zones'
import type { Room } from 'livekit-client'
import type { AvatarPosition, ProximityAudioControllerOptions } from './proximity-audio-controller'
import { PUBLIC_LIVEKIT_TOKEN_ENDPOINT } from '$env/static/public'
import { Room as LiveKitRoom } from 'livekit-client'
import { attachRemoteAudioElements } from './attach-remote-audio'
import { fetchLiveKitToken } from './livekit-token-client'
import { resolvePrivateZoneOccupancy } from './private-room-occupancy'

/** Baked in at build time (adapter-static/SPA — no server to read this at runtime) — see .env.example. */
const DEFAULT_TOKEN_ENDPOINT = PUBLIC_LIVEKIT_TOKEN_ENDPOINT

/** A private zone's LiveKit room name, derived from its (stable, unique) Tiled object id — livekit-token.ts only grants a `private-<id>` room, never an arbitrary name. */
function roomNameForZone(zoneId: number): string {
  return `private-${zoneId}`
}

export interface PrivateRoomTransitionHandlers {
  /** The private room just became active (2nd person entered the zone) — callers should drop `office` audio and point media controls/video overlay at `room` for as long as it stays connected. */
  onConnect: (room: Room, zoneId: number) => void
  /** The private room just ended (dropped back under 2 people, or the local avatar left the zone) — callers should reconnect `office` audio. */
  onDisconnect: () => void
}

/**
 * Owns a second, on-demand LiveKit room for private conversation zones (the `spaces` layer's
 * `private: true` objects) — separate from `ProximityAudioController`'s single, always-on
 * `office` room. Nobody connects while alone in a zone (avoids paying for a LiveKit
 * connection nobody's using); connects once a 2nd person is present, and drops the connection
 * again once back under 2 (or the local avatar leaves the zone entirely).
 */
export class PrivateRoomController {
  private room: Room | null = null
  private zones: readonly PrivateZone[] = []
  private connectedZoneIdInternal: number | null = null
  private connecting = false
  private readonly tokenEndpoint: string

  constructor(tokenEndpoint: string = DEFAULT_TOKEN_ENDPOINT) {
    this.tokenEndpoint = tokenEndpoint
  }

  /** The map's `spaces` layer objects flagged `private: true`. */
  setZones(zones: readonly PrivateZone[]): void {
    this.zones = zones
  }

  /** The zone currently backing an active private room connection, or `null` if not connected to one. */
  get connectedZoneId(): number | null {
    return this.connectedZoneIdInternal
  }

  /**
   * Called once per local animation frame. Connects or disconnects the private room as zone
   * occupancy crosses the 2-person threshold, invoking `handlers.onConnect`/`onDisconnect` so
   * the caller can swap audio/video/media-control focus between `office` and this room without
   * this controller needing to know about either.
   */
  async update(
    options: ProximityAudioControllerOptions,
    localPosition: AvatarPosition,
    remotePositions: ReadonlyMap<string, AvatarPosition>,
    handlers: PrivateRoomTransitionHandlers,
  ): Promise<void> {
    const { zoneId, occupantSessionIds } = resolvePrivateZoneOccupancy(this.zones, localPosition, remotePositions)

    // Left the zone we were connected to (or moved straight into a different one) — drop the
    // old room now; if the new zone also warrants a connection, the check below picks it up
    // next frame once connectedZoneIdInternal is back to null.
    if (this.connectedZoneIdInternal !== null && zoneId !== this.connectedZoneIdInternal) {
      this.teardown(handlers.onDisconnect)
    }

    const shouldBeConnected = zoneId !== null && occupantSessionIds.length >= 1

    if (shouldBeConnected && this.connectedZoneIdInternal === null && !this.connecting) {
      await this.establish(options, zoneId!, handlers.onConnect)
      return
    }

    if (!shouldBeConnected && this.connectedZoneIdInternal !== null) {
      this.teardown(handlers.onDisconnect)
    }
  }

  /** Tears down the private room connection unconditionally — call on scene shutdown. */
  disconnect(): void {
    this.teardown()
  }

  private async establish(options: ProximityAudioControllerOptions, zoneId: number, onConnect: PrivateRoomTransitionHandlers['onConnect']): Promise<void> {
    this.connecting = true
    try {
      const room = new LiveKitRoom()
      attachRemoteAudioElements(room)
      const { token, url } = await fetchLiveKitToken(this.tokenEndpoint, { ...options, room: roomNameForZone(zoneId) })
      await room.connect(url, token)
      this.room = room
      this.connectedZoneIdInternal = zoneId
      onConnect(room, zoneId)
    }
    catch (error) {
      console.warn('kangeikai: failed to connect to private room', error)
    }
    finally {
      this.connecting = false
    }
  }

  private teardown(onDisconnect?: PrivateRoomTransitionHandlers['onDisconnect']): void {
    const room = this.room
    this.room = null
    this.connectedZoneIdInternal = null
    onDisconnect?.()
    void room?.disconnect()
  }
}
