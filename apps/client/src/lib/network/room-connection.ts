import type { MapSchema } from '@colyseus/schema'
import type { Room } from '@colyseus/sdk'
import type { AvatarDirection, AvatarMotionState, AvatarPresence, AvatarSpriteType, AvatarState } from '@kangeikai/shared'
import { PUBLIC_COLYSEUS_URL } from '$env/static/public'
import { Client, getStateCallbacks } from '@colyseus/sdk'
import { PendingUpdateStateSender } from './pending-update-state-sender'

/**
 * Mirrors contracts/office-room-protocol.md's OfficeJoinOptions — keep in sync with
 * apps/server's message-schemas.ts if this shape changes (contract's "Stability" section).
 */
export interface OfficeJoinOptions {
  displayName: string
  spriteType: AvatarSpriteType
  /**
   * Validated server-side (`OfficeRoom.onAuth`) — only enforced when the deployment has
   * `ACCESS_CODE` configured.
   */
  accessCode: string
  presence?: AvatarPresence
}

/** Mirrors contracts/office-room-protocol.md's UpdateStatePayload. */
export interface UpdateStatePayload {
  x: number
  y: number
  direction: AvatarDirection
  motionState: AvatarMotionState
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected'

/**
 * Mirrors apps/server's message-schemas.ts InteractionPayload's `kind` — a generic point-to-
 * point nudge. Only `'hello'` (issue #157, "Say Hello") is acted on by any client feature today;
 * `'attention'` is reserved for a planned follow-up issue ("chamar atenção") that reuses this
 * exact same message/handler shape.
 */
export type InteractionKind = 'hello' | 'attention'

/** Mirrors apps/server's `interactionReceived` message payload. */
export interface InteractionReceivedPayload {
  kind: InteractionKind
  fromSessionId: string
  fromDisplayName: string
}

type ConnectionStateListener = (state: ConnectionState) => void
type RemoteAvatarListener = (sessionId: string, avatar: AvatarState) => void
type RemoteAvatarRemoveListener = (sessionId: string) => void
type InteractionReceivedListener = (payload: InteractionReceivedPayload) => void

/** Baked in at build time (adapter-static/SPA — no server to read this at runtime) — see .env.example. */
const DEFAULT_SERVER_URL = PUBLIC_COLYSEUS_URL
/** How long to wait for the server's "sessionProof" message before giving up (see connect()). */
const SESSION_PROOF_TIMEOUT_MS = 5000

interface OfficeRoomStateShape {
  players: MapSchema<AvatarState>
}

/**
 * Minimal room-shape declaration for SDK type inference — deliberately not importing
 * apps/server's actual OfficeRoom/AvatarSchema (separate deployable apps; only
 * packages/shared is shared cross-app). The client decodes room state via Colyseus's
 * reflection handshake regardless of this compile-time annotation.
 */
interface OfficeRoomLike {
  state: OfficeRoomStateShape
  onJoin: (client: unknown, options?: OfficeJoinOptions) => unknown
}

function toAvatarSnapshot(avatar: AvatarState): AvatarState {
  return {
    displayName: avatar.displayName,
    x: avatar.x,
    y: avatar.y,
    direction: avatar.direction,
    motionState: avatar.motionState,
    spriteType: avatar.spriteType,
    presence: avatar.presence,
  }
}

/**
 * Connects to the single shared "office" room, throttles/sends the local avatar's state, and
 * exposes both connection-state and remote-avatar events.
 *
 * Automatic reconnection on an ungraceful drop (FR-008) is handled by `@colyseus/sdk`'s
 * `Room` itself (per research.md's decision to rely on Colyseus's built-in mechanism rather
 * than custom reconnect code): on an abnormal close it retries with backoff behind the
 * scenes, reusing the same `Room` instance/session — `onDrop`/`onReconnect` below only
 * surface that as connection-state events; `onLeave` only fires for a genuine leave (a
 * consented disconnect, or the retries giving up once the server's reconnection grace period
 * elapses, per FR-009).
 */
export class RoomConnection {
  private readonly client: Client
  private room: Room<OfficeRoomLike, OfficeRoomStateShape> | undefined

  private readonly connectionListeners = new Set<ConnectionStateListener>()
  private readonly remoteAddListeners = new Set<RemoteAvatarListener>()
  private readonly remoteChangeListeners = new Set<RemoteAvatarListener>()
  private readonly remoteRemoveListeners = new Set<RemoteAvatarRemoveListener>()
  private readonly interactionReceivedListeners = new Set<InteractionReceivedListener>()

  private readonly stateSender = new PendingUpdateStateSender(payload => this.room?.send('updateState', payload))
  private proof: string | undefined

  constructor(serverUrl: string = DEFAULT_SERVER_URL) {
    this.client = new Client(serverUrl)
  }

  /**
   * The local participant's Colyseus session id, once connected — MUST be used as the
   * LiveKit `identity` when requesting a proximity token (contracts/livekit-token-endpoint.md
   * "Stability" section, spec 003).
   */
  get sessionId(): string | undefined {
    return this.room?.sessionId
  }

  /**
   * Proves `sessionId` came from `OfficeRoom.onJoin` — MUST be sent as `proof` in the
   * `/livekit-token` request (contracts/livekit-token-endpoint.md), which rejects a token
   * request otherwise (security review finding: it used to accept any identity unverified).
   * `undefined` until the server's "sessionProof" message arrives (or if it never does —
   * e.g. `SESSION_SIGNING_SECRET` unset server-side — in which case proximity audio/video
   * simply fails to connect, per FR-009's independence from movement/presence).
   */
  get sessionProof(): string | undefined {
    return this.proof
  }

  onConnectionStateChange(listener: ConnectionStateListener): () => void {
    this.connectionListeners.add(listener)
    return () => this.connectionListeners.delete(listener)
  }

  /** Fires once per remote participant already present or newly joining (excludes self). */
  onRemoteAvatarAdd(listener: RemoteAvatarListener): () => void {
    this.remoteAddListeners.add(listener)
    return () => this.remoteAddListeners.delete(listener)
  }

  /** Fires whenever a remote participant's avatar state changes. */
  onRemoteAvatarChange(listener: RemoteAvatarListener): () => void {
    this.remoteChangeListeners.add(listener)
    return () => this.remoteChangeListeners.delete(listener)
  }

  /** Fires when a remote participant disappears (leave, or reconnection grace period). */
  onRemoteAvatarRemove(listener: RemoteAvatarRemoveListener): () => void {
    this.remoteRemoveListeners.add(listener)
    return () => this.remoteRemoveListeners.delete(listener)
  }

  /** Fires whenever the server relays a point-to-point interaction (issue #157's "Say Hello") addressed to the local session. */
  onInteractionReceived(listener: InteractionReceivedListener): () => void {
    this.interactionReceivedListeners.add(listener)
    return () => this.interactionReceivedListeners.delete(listener)
  }

  async connect(options: OfficeJoinOptions): Promise<void> {
    this.emitConnectionState('connecting')
    try {
      const room = await this.client.joinOrCreate<OfficeRoomLike>('office', options)
      this.room = room
      room.onLeave(() => this.emitConnectionState('disconnected'))
      room.onDrop(() => this.emitConnectionState('connecting'))
      room.onReconnect(() => this.emitConnectionState('connected'))
      this.bindRemoteAvatarEvents(room)
      this.bindInteractionEvents(room)
      await this.awaitSessionProof(room)
      this.emitConnectionState('connected')
    }
    catch (error) {
      this.emitConnectionState('disconnected')
      throw error
    }
  }

  /**
   * Waits briefly for the server's "sessionProof" message (sent synchronously from
   * `OfficeRoom.onJoin`, so it's expected almost immediately). Times out rather than hanging
   * forever if it never arrives, so a misconfigured server degrades to "no proximity audio/
   * video" instead of blocking movement/presence sync from ever reporting "connected".
   */
  private awaitSessionProof(room: Room<OfficeRoomLike, OfficeRoomStateShape>): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('kangeikai: no session proof received from server (SESSION_SIGNING_SECRET missing?)')
        resolve()
      }, SESSION_PROOF_TIMEOUT_MS)

      room.onMessage<{ proof: string }>('sessionProof', (payload) => {
        clearTimeout(timeout)
        this.proof = payload.proof
        resolve()
      })
    })
  }

  disconnect(): void {
    this.stateSender.reset()
    void this.room?.leave()
    this.room = undefined
  }

  /**
   * Sends the local avatar's state if it changed since the last send, throttled to
   * SEND_INTERVAL_MS. A trailing send is scheduled when throttled so the final state right
   * before movement stops is never dropped.
   */
  sendState(payload: UpdateStatePayload): void {
    if (!this.room) {
      return
    }
    this.stateSender.submit(payload)
  }

  /**
   * Sends a still-pending (throttled) position update immediately instead of waiting for the
   * trailing timer — MUST be called before requesting a private-room LiveKit token (issue #134):
   * the server's private-zone check reads the last position it received via `updateState`, so an
   * HTTP token request racing ahead of a throttled position send can be checked against a stale,
   * "not yet in the zone" position and get rejected.
   */
  flushPendingState(): void {
    this.stateSender.flushPending()
  }

  sendPresence(presence: AvatarPresence): void {
    this.room?.send('setPresence', { presence })
  }

  /** Sends a point-to-point interaction (issue #157's "Say Hello") to `targetSessionId` — the server revalidates both sides' presence before relaying it, so this is a no-op rather than a client-side guarantee. */
  sendInteraction(kind: InteractionKind, targetSessionId: string): void {
    this.room?.send('interaction', { kind, targetSessionId })
  }

  private bindRemoteAvatarEvents(room: Room<OfficeRoomLike, OfficeRoomStateShape>): void {
    const callbacks = getStateCallbacks(room)

    callbacks(room.state).players.onAdd((avatar, sessionId) => {
      if (sessionId === room.sessionId) {
        return
      }
      this.emitRemoteAvatar(this.remoteAddListeners, sessionId, avatar)
      callbacks(avatar).onChange(() => this.emitRemoteAvatar(this.remoteChangeListeners, sessionId, avatar))
    })

    callbacks(room.state).players.onRemove((_avatar, sessionId) => {
      if (sessionId === room.sessionId) {
        return
      }
      for (const listener of this.remoteRemoveListeners) {
        listener(sessionId)
      }
    })
  }

  private bindInteractionEvents(room: Room<OfficeRoomLike, OfficeRoomStateShape>): void {
    room.onMessage<InteractionReceivedPayload>('interactionReceived', (payload) => {
      for (const listener of this.interactionReceivedListeners) {
        listener(payload)
      }
    })
  }

  private emitRemoteAvatar(listeners: Set<RemoteAvatarListener>, sessionId: string, avatar: AvatarState): void {
    const snapshot = toAvatarSnapshot(avatar)
    for (const listener of listeners) {
      listener(sessionId, snapshot)
    }
  }

  private emitConnectionState(state: ConnectionState): void {
    for (const listener of this.connectionListeners) {
      listener(state)
    }
  }
}
