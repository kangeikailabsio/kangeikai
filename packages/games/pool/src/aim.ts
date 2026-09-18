/**
 * Aim and cue-charge geometry. Deliberately free of Phaser so it stays importable from the
 * package's Node-environment Vitest run — `client.ts` cannot be imported there.
 */
import type { Ball } from '@kangeikai/game-pool/physics'
import { BALL_RADIUS, TABLE_HEIGHT, TABLE_WIDTH } from '@kangeikai/game-pool/physics'

/** Matches the `shoot` command's schema bounds in protocol.ts. */
export const MIN_POWER = 0.01
export const MAX_POWER = 1
/** Backward pull, in table units, that charges a full-power shot. */
export const MAX_PULL = 150
/**
 * Below this pull a release is a mis-click, not a shot. At MIN_POWER the cue ball leaves at
 * 16 u/s against 120 u/s of deceleration and stops after roughly one unit — it reaches nothing,
 * which scores as a foul. So a bare click must never shoot.
 */
export const MIN_PULL = 10

export interface Point {
  x: number
  y: number
}

export function aimAngle(cue: Point, target: Point): number {
  return Math.atan2(target.y - cue.y, target.x - cue.x)
}

/** Signed pull along the aim axis: positive pulling the cue back, negative pushing it forward. */
export function pullDistance(anchor: Point, point: Point, angle: number): number {
  return -((point.x - anchor.x) * Math.cos(angle) + (point.y - anchor.y) * Math.sin(angle))
}

/** Always within [MIN_POWER, MAX_POWER], so the result can never violate the wire schema. */
export function chargeFromDrag(anchor: Point, point: Point, angle: number, maxPull = MAX_PULL): number {
  return Math.min(MAX_POWER, Math.max(MIN_POWER, pullDistance(anchor, point, angle) / maxPull))
}

/** First-contact guide only: clients never predict or decide the outcome of a shot. */
export function aimDistance(balls: Ball[], x: number, y: number, angle: number): number {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  let distance = 1200
  if (dx > 0)
    distance = Math.min(distance, (TABLE_WIDTH - BALL_RADIUS - x) / dx)
  if (dx < 0)
    distance = Math.min(distance, (BALL_RADIUS - x) / dx)
  if (dy > 0)
    distance = Math.min(distance, (TABLE_HEIGHT - BALL_RADIUS - y) / dy)
  if (dy < 0)
    distance = Math.min(distance, (BALL_RADIUS - y) / dy)
  for (const ball of balls) {
    if (ball.id === 0 || ball.pocketed)
      continue
    const bx = ball.x - x
    const by = ball.y - y
    const projection = bx * dx + by * dy
    const perpendicular = bx * bx + by * by - projection * projection
    if (projection > 0 && perpendicular < 4 * BALL_RADIUS * BALL_RADIUS)
      distance = Math.min(distance, Math.max(0, projection - Math.sqrt(4 * BALL_RADIUS * BALL_RADIUS - perpendicular)))
  }
  return Math.max(0, distance)
}
