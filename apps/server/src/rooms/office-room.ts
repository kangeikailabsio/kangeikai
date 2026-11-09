import type { Client } from 'colyseus'
import type { AuthenticatedUser, Authenticator } from '../auth/authenticator'
import process from 'node:process'
import { POOL_COMMAND, POOL_EVENT } from '@kangeikai/game-pool/protocol'
import { PoolManager } from '@kangeikai/game-pool/server'
import { CLOSE_CODE_SESSION_REPLACED, privateZoneAt, resolveRespawnPoint } from '@kangeikai/shared'
import { CloseCode, Room } from 'colyseus'
import * as v from 'valibot'
import { colliders, gameTables, mapSize, privateZones, respawnAreas } from '../map-zones'
import { acceptMove, newBudget } from '../movement/movement-guard'
import { computeSessionProof } from '../session-proof'
import { interactionPayloadSchema, officeJoinOptionsSchema, setPresencePayloadSchema, updateStatePayloadSchema } from './message-schemas'
import { AvatarSchema } from './schema/avatar-schema'
import { OfficeRoomState } from './schema/office-room-state'

let authenticator: Authenticator | null = null

/**
 * Wires the account lookup `OfficeRoom.onAuth` uses (issue #232). Set once at boot (`index.ts`),
 * and by tests with a fake; until it is set every join is refused, so the room fails closed.
 */
export function setOfficeRoomAuthenticator(next: Authenticator | null): void {
  authenticator = next
}

/** Bounded reconnection grace period for an ungraceful disconnect (FR-005, FR-008, FR-009). */
const RECONNECTION_GRACE_PERIOD_SECONDS = 15

export class OfficeRoom extends Room<{ state: OfficeRoomState }> {
  private pool!: PoolManager
  /**
   * Skips the speed and wall checks of `updateState` (issue #255). Only the end-to-end tests set
   * it, because they place the avatar with a teleport hook; it must never be on in production.
   */
  private readonly allowTeleport = process.env.E2E_ALLOW_TELEPORT === 'true'

  onCreate(): void {
    this.setState(new OfficeRoomState())
    this.pool = new PoolManager(gameTables, {
      identity: (sessionId) => {
        const avatar = this.state.players.get(sessionId)
        return avatar ? { name: avatar.displayName, spriteType: avatar.spriteType, x: avatar.x, y: avatar.y, available: avatar.presence === 'available' } : undefined
      },
      send: (sessionId, event) => this.clients.find(client => client.sessionId === sessionId)?.send(POOL_EVENT, event),
    })
    this.onMessage(POOL_COMMAND, (client, message) => {
      this.pool.handle(client.sessionId, message)
      const avatar = this.state.players.get(client.sessionId)
      if (avatar && this.pool.isAttached(client.sessionId))
        avatar.motionState = 'idle'
    })
    this.setSimulationInterval(delta => this.pool.tick(delta), 1000 / 60)

    this.onMessage('updateState', (client, message) => {
      const result = v.safeParse(updateStatePayloadSchema, message)
      if (!result.success) {
        return
      }

      const avatar = this.state.players.get(client.sessionId)
      if (!avatar) {
        return
      }

      if (avatar.presence === 'busy' || this.pool.isAttached(client.sessionId)) {
        return
      }

      if (!this.allowTeleport && !this.acceptMovement(client, avatar, result.output)) {
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
   * Who may join: only someone holding a valid, unexpired ticket for an existing account. Kept in
   * `onAuth` (not `onJoin`) so a rejection happens before any session or avatar exists, blocking
   * movement, presence and proximity audio/video in one place (the latter two depend on a real
   * `onJoin` having happened — see session-proof.ts). What it returns is `client.auth` and the
   * third argument of `onJoin`.
   */
  async onAuth(_client: Client, options: unknown): Promise<AuthenticatedUser | false> {
    const result = v.safeParse(officeJoinOptionsSchema, options)
    if (!result.success || !authenticator)
      return false

    return (await authenticator(result.output.ticket)) ?? false
  }

  onJoin(client: Client, options: unknown, auth: AuthenticatedUser): void {
    const { presence } = v.parse(officeJoinOptionsSchema, options)

    // One avatar per account (issue #232): a join from another tab or device replaces the earlier
    // one. The old avatar is dropped synchronously and its connection closed with a dedicated code,
    // instead of leaving both on the map until `onLeave`/the grace period catches up (issue #178).
    for (const [existingSessionId, existingAvatar] of this.state.players.entries()) {
      if (existingAvatar.userId === auth.userId) {
        this.state.players.delete(existingSessionId)
        this.clients.getById(existingSessionId)?.leave(CLOSE_CODE_SESSION_REPLACED)
        break
      }
    }

    const avatar = new AvatarSchema()
    avatar.displayName = auth.displayName
    avatar.spriteType = auth.spriteType
    avatar.presence = presence
    avatar.characterSelection = auth.characterSelection ? JSON.stringify(auth.characterSelection) : ''
    avatar.userId = auth.userId
    // The server chooses where a person starts, from the map's `respawn` layer (issue #254), and
    // tells the client, which has no say in it.
    const spawn = resolveRespawnPoint(respawnAreas, { x: mapSize.width / 2, y: mapSize.height / 2 })
    avatar.x = spawn.x
    avatar.y = spawn.y

    this.state.players.set(client.sessionId, avatar)
    avatar.movement = newBudget(Date.now())
    client.send('spawn', spawn)

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
   * Checks a reported position against the map and the speed limit (issue #255). An impossible
   * one is not stored: the sender is told where to go back to (the last valid position) and
   * nobody else ever sees it. Nobody is kicked; a laggy client only gets pulled back a little.
   */
  private acceptMovement(client: Client, avatar: AvatarSchema, to: { x: number, y: number }): boolean {
    const now = Date.now()
    avatar.movement ??= newBudget(now)
    if (acceptMove(avatar.movement, { x: avatar.x, y: avatar.y }, to, { colliders, mapWidth: mapSize.width, mapHeight: mapSize.height }, now)) {
      return true
    }

    client.send('correctPosition', { x: avatar.x, y: avatar.y })
    if (now - avatar.lastRejectLoggedAt > 5000) {
      avatar.lastRejectLoggedAt = now
      console.warn(`kangeikai: rejected an impossible movement of ${avatar.displayName} to (${to.x}, ${to.y}); sent back to (${avatar.x}, ${avatar.y})`)
    }
    return false
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
      this.pool.leave(client.sessionId)
      return
    }

    this.pool.drop(client.sessionId)
    try {
      await this.allowReconnection(client, RECONNECTION_GRACE_PERIOD_SECONDS)
      this.state.players.set(client.sessionId, avatar)
      this.pool.reconnect(client.sessionId)
    }
    catch {
      this.pool.leave(client.sessionId)
      // Grace period elapsed without reconnecting — session is already removed above, so this
      // finalizes as a full leave (FR-009) with no further action needed.
    }
  }

  onDispose(): void {
    this.pool.dispose()
  }
}
