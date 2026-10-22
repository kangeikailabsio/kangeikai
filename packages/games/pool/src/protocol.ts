import type { GameFormat, GameMode, Group, Phase, Seat, Team } from '@kangeikai/game-pool/core'
import type { Ball } from '@kangeikai/game-pool/physics'
import type { AvatarSpriteType } from '@kangeikai/shared'
import { GAME_FORMATS, GAME_MODES } from '@kangeikai/game-pool/core'
import * as v from 'valibot'

const finite = v.pipe(v.number(), v.finite())
const tableId = v.pipe(v.string(), v.minLength(1), v.maxLength(80))
const sequence = v.pipe(v.number(), v.integer(), v.minValue(0))
const turn = { tableId, matchId: sequence, turnId: sequence }

export const poolCommandSchema = v.variant('kind', [
  v.object({ kind: v.literal('open'), tableId }),
  v.object({ kind: v.literal('leave'), tableId }),
  /** `team` (0 = A, 1 = B) is required in 2v2 and ignored in 1v1; sent while seated it asks to switch teams. */
  v.object({ kind: v.literal('sit'), tableId, team: v.optional(v.picklist([0, 1])) }),
  v.object({ kind: v.literal('stand'), tableId }),
  v.object({ kind: v.literal('playBot'), tableId }),
  v.object({ kind: v.literal('setMode'), tableId, mode: v.picklist(GAME_MODES) }),
  v.object({ kind: v.literal('setFormat'), tableId, format: v.picklist(GAME_FORMATS) }),
  v.object({ kind: v.literal('ready'), tableId, ready: v.boolean() }),
  v.object({ kind: v.literal('place'), ...turn, x: finite, y: finite }),
  /** The shooter's live aim, relayed only to spectators and the shooter's teammate. */
  v.object({ kind: v.literal('aim'), ...turn, angle: v.pipe(finite, v.minValue(-Math.PI), v.maxValue(Math.PI)), power: v.pipe(finite, v.minValue(0.01), v.maxValue(1)), locked: v.boolean(), placing: v.optional(v.object({ x: finite, y: finite })) }),
  v.object({ kind: v.literal('shoot'), ...turn, angle: v.pipe(finite, v.minValue(-Math.PI), v.maxValue(Math.PI)), power: v.pipe(finite, v.minValue(0.01), v.maxValue(1)) }),
])

export type PoolCommand = v.InferOutput<typeof poolCommandSchema>

export interface PoolPlayer {
  sessionId: string
  name: string
  /** So the overlay can show the same avatar portrait the office does, without a second lookup. */
  spriteType: AvatarSpriteType
  ready: boolean
  connected: boolean
}

export interface PoolSnapshot {
  tableId: string
  matchId: number
  turnId: number
  revision: number
  serverTime: number
  phase: Phase
  mode: GameMode
  format: GameFormat
  /** Seats in the order they shoot (drawn when a match starts). */
  order: Seat[]
  /** Seat allowed to change the mode before the match, or null when nobody is seated. */
  ownerSeat: Seat | null
  /** One entry per seat; a seat's team is `teamOfSeat(index, players.length)`. */
  players: (PoolPlayer | null)[]
  spectators: number
  balls: Ball[]
  /** Indexed by team, not by seat. */
  groups: [Group | null, Group | null]
  turn: Seat
  breaking: boolean
  ballInHand: boolean
  cuePlaced: boolean
  deadline: number | null
  paused: boolean
  remainingMs: number
  winner: Team | null
  notice: string
}

export interface PoolAim {
  matchId: number
  turnId: number
  angle: number
  power: number
  locked: boolean
  placing?: { x: number, y: number }
}

export type PoolEvent = { kind: 'snapshot', state: PoolSnapshot }
  | { kind: 'aim', tableId: string, aim: PoolAim | null }
  | { kind: 'closed', tableId: string }
  | { kind: 'error', tableId?: string, message: string }

export const POOL_COMMAND = 'poolCommand'
export const POOL_EVENT = 'poolEvent'
export const SHOT_TIME_MS = 30_000
/** Aim messages closer together than this are dropped by the server. */
export const AIM_MIN_INTERVAL_MS = 40
/**
 * Broadcast period while balls move. The gate is only evaluated on the room's 60 Hz simulation
 * ticks, so the real period alternates ~50/66.7 ms — which is why the client runs its own
 * simulation between snapshots instead of interpolating over a fixed window.
 */
export const SNAPSHOT_INTERVAL_MS = 50
