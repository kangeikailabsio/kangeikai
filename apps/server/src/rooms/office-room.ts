import type { Client } from 'colyseus'
import process from 'node:process'
import { privateZoneAt } from '@kangeikai/shared'
import { CloseCode, Room } from 'colyseus'
import * as v from 'valibot'
import { privateZones } from '../map-zones'
import { computeSessionProof } from '../session-proof'
import { interactionPayloadSchema, officeJoinOptionsSchema, setPresencePayloadSchema, updateStatePayloadSchema } from './message-schemas'
import { AvatarSchema } from './schema/avatar-schema'
import { OfficeRoomState } from './schema/office-room-state'

/**
 * Placeholder spawn point, matching apps/client's office-scene.ts SPAWN_X/SPAWN_Y — see that
 * file's comment on the map's current lack of a collision layer (same known gap applies here).
 */
const SPAWN_X = 150
const SPAWN_Y = 150

/** Bounded reconnection grace period for an ungraceful disconnect (FR-005, FR-008, FR-009). */
const RECONNECTION_GRACE_PERIOD_SECONDS = 15

export class OfficeRoom extends Room<{ state: OfficeRoomState }> {
  onCreate(): void {
    this.setState(new OfficeRoomState())

    this.onMessage('updateState', (client, message) => {
      const result = v.safeParse(updateStatePayloadSchema, message)
      if (!result.success) {
        return
      }

      const avatar = this.state.players.get(client.sessionId)
      if (!avatar) {
        return
      }

      if (avatar.presence === 'busy') {
        return
      }

      avatar.x = result.output.x
      avatar.y = result.output.y
      avatar.direction = result.output.direction
      avatar.motionState = result.output.motionState
    })

    this.onMessage('setPresence', (client, message) => {
      const result = v.safeParse(setPresencePayloadSchema, message)
      if (!result.success) {
        return
      }

      const avatar = this.state.players.get(client.sessionId)
      if (!avatar) {
        return
      }

      avatar.presence = result.output.presence
    })

    /**
     * Generic point-to-point nudge (issue #157's "Say Hello"; a planned "chamar atenção" issue
     * reuses this same handler/schema with `kind: 'attention'` instead) — relays `kind` verbatim
     * to whichever client owns `targetSessionId`, so it's the *client* that decides what UI a
     * given `kind` gets, not this handler. Revalidates presence server-side on both ends rather
     * than trusting the client's own busy-hidden button, same guard style as `updateState`/
     * `setPresence` above: either side missing or busy is a silent no-op.
     */
    this.onMessage('interaction', (client, message) => {
      const result = v.safeParse(interactionPayloadSchema, message)
      if (!result.success) {
        return
      }

      const sender = this.state.players.get(client.sessionId)
      if (!sender || sender.presence === 'busy') {
        return
      }

      const target = this.state.players.get(result.output.targetSessionId)
      if (!target || target.presence === 'busy') {
        return
      }

      const targetClient = this.clients.getById(result.output.targetSessionId)
      if (!targetClient) {
        return
      }

      targetClient.send('interactionReceived', {
        kind: result.output.kind,
        fromSessionId: client.sessionId,
        fromDisplayName: sender.displayName,
      })
    })
  }

  /**
   * A simple shared-secret gate (not per-user auth) — kept out of `onJoin` because a rejection
   * here happens before a session/avatar is ever created, blocking movement, presence, AND
   * proximity audio/video in one place (the latter two depend on a real `onJoin` having
   * happened at all — see session-proof.ts). Only enforced when `ACCESS_CODE` is actually set,
   * so local dev needs no code configured.
   */
  onAuth(_client: Client, options: unknown): boolean {
    const accessCode = process.env.ACCESS_CODE
    if (!accessCode) {
      return true
    }

    const result = v.safeParse(officeJoinOptionsSchema, options)
    return result.success && result.output.accessCode === accessCode
  }

  onJoin(client: Client, options: unknown): void {
    const { displayName, spriteType, presence } = v.parse(officeJoinOptionsSchema, options)

    const avatar = new AvatarSchema()
    avatar.displayName = displayName
    avatar.spriteType = spriteType
    avatar.presence = presence
    avatar.x = SPAWN_X
    avatar.y = SPAWN_Y

    this.state.players.set(client.sessionId, avatar)

    // Lets /livekit-token (spec 003) confirm this identity really went through onJoin, instead
    // of accepting any identity/name unauthenticated (security review finding). Best-effort:
    // a missing SESSION_SIGNING_SECRET degrades to "no proximity audio/video" rather than
    // blocking the room join itself (FR-009's movement/presence independence).
    try {
      client.send('sessionProof', { proof: computeSessionProof(client.sessionId) })
    }
    catch (error) {
      console.warn('kangeikai: failed to send session proof (SESSION_SIGNING_SECRET missing?)', error)
    }
  }

  /**
   * Whether `sessionId`'s last-synced position is inside the given private zone — called by
   * `/livekit-token` via `matchMaker.remoteRoomCall` before minting a `private-<zoneId>` token
   * (issue #60/TASK #122), so a token is only ever granted to someone whose avatar has actually
   * walked there. A plain query, not a message: it never touches LiveKit credentials, and
   * `remoteRoomCall` works whether the caller is in this same process (today) or not.
   *
   * `x`/`y` are themselves still client-reported (`updateState` has no server-side movement
   * validation) — this only closes the "requested a token without ever syncing a matching
   * position at all" gap, not the broader trust model.
   */
  isPositionInZone(sessionId: string, zoneId: number): boolean {
    const avatar = this.state.players.get(sessionId)
    if (!avatar) {
      return false
    }
    return privateZoneAt(privateZones, avatar.x, avatar.y)?.id === zoneId
  }

  async onLeave(client: Client, code?: number): Promise<void> {
    const avatar = this.state.players.get(client.sessionId)
    this.state.players.delete(client.sessionId)

    if (!avatar || code === CloseCode.CONSENTED) {
      return
    }

    try {
      await this.allowReconnection(client, RECONNECTION_GRACE_PERIOD_SECONDS)
      this.state.players.set(client.sessionId, avatar)
    }
    catch {
      // Grace period elapsed without reconnecting — session is already removed above, so this
      // finalizes as a full leave (FR-009) with no further action needed.
    }
  }
}
