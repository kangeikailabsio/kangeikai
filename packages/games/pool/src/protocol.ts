import type { Group, Phase, Seat } from '@kangeikai/game-pool/core'
import type { Ball } from '@kangeikai/game-pool/physics'
import type { AvatarSpriteType } from '@kangeikai/shared'
import * as v from 'valibot'

const finite = v.pipe(v.number(), v.finite())
const tableId = v.pipe(v.string(), v.minLength(1), v.maxLength(80))
const sequence = v.pipe(v.number(), v.integer(), v.minValue(0))
const turn = { tableId, matchId: sequence, turnId: sequence }

export const poolCommandSchema = v.variant('kind', [
  v.object({ kind: v.literal('open'), tableId }),
  v.object({ kind: v.literal('leave'), tableId }),
  v.object({ kind: v.literal('sit'), tableId }),
  v.object({ kind: v.literal('stand'), tableId }),
  v.object({ kind: v.literal('ready'), tableId, ready: v.boolean() }),
  v.object({ kind: v.literal('place'), ...turn, x: finite, y: finite }),
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
  players: [PoolPlayer | null, PoolPlayer | null]
  spectators: number
  balls: Ball[]
  groups: [Group | null, Group | null]
  turn: Seat
  breaking: boolean
  ballInHand: boolean
  cuePlaced: boolean
  deadline: number | null
  paused: boolean
  remainingMs: number
  winner: Seat | null
  notice: string
}

export type PoolEvent = { kind: 'snapshot', state: PoolSnapshot }
  | { kind: 'closed', tableId: string }
  | { kind: 'error', tableId?: string, message: string }

export const POOL_COMMAND = 'poolCommand'
export const POOL_EVENT = 'poolEvent'
export const SHOT_TIME_MS = 30_000
/**
 * Broadcast period while balls move. The gate is only evaluated on the room's 60 Hz simulation
 * ticks, so the real period alternates ~50/66.7 ms — which is why the client runs its own
 * simulation between snapshots instead of interpolating over a fixed window.
 */
export const SNAPSHOT_INTERVAL_MS = 50
