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

/** Everything drawn for an aim, in table coordinates: the dashed line, the contact circle and the cue. */
export interface AimGuide {
  dashes: [Point, Point][]
  /** Centre of the circle marking where the cue ball first touches something. */
  contact: Point
  /** The cue stick's body and its lighter tip. */
  cue: [Point, Point]
  tip: [Point, Point]
}

/**
 * `length` is the first-contact distance from {@link aimDistance}. `strike` runs from 1 (cue pulled back
 * by the power) to 0 (cue touching the ball), so the follow-through after release is just a smaller value.
 */
export function aimGuide(cue: Point, angle: number, length: number, power: number, strike = 1): AimGuide {
  const dx = Math.cos(angle)
  const dy = Math.sin(angle)
  const along = (distance: number): Point => ({ x: cue.x + dx * distance, y: cue.y + dy * distance })
  const dashes: AimGuide['dashes'] = []
  for (let d = 15; d < length; d += 14)
    dashes.push([along(d), along(Math.min(d + 6, length))])
  const pull = (18 + power * 55) * strike
  return { dashes, contact: along(length), cue: [along(-pull), along(-(pull + 90))], tip: [along(-pull), along(-(pull + 7))] }
}
