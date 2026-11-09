import type { CollisionRect } from '@kangeikai/shared'
import { collidesWithAny, feetHitbox, SPEED_PX_PER_SECOND, SPRINT_SPEED_MULTIPLIER } from '@kangeikai/shared'

export interface Point {
  x: number
  y: number
}

/** What a person's reported movement is checked against (issue #255). */
export interface MovementRules {
  colliders: readonly CollisionRect[]
  mapWidth: number
  mapHeight: number
}

/** The fastest a real client moves (sprinting), with room to spare: the server rejects the impossible, it does not replay the client. */
export const MAX_SPEED_PX_PER_SECOND = SPEED_PX_PER_SECOND * SPRINT_SPEED_MULTIPLIER * 1.5

/** Extra distance always allowed on a single step, for rounding and the jitter between two messages. */
export const STEP_MARGIN_PX = 32

/**
 * How much unused speed can pile up while someone stands still or messages are late, in seconds
 * of full speed. Messages that arrive in a burst after a network hiccup spend it; it never lets
 * a long silence turn into a long jump.
 */
export const ALLOWANCE_SECONDS = 1

/** Distance between the points tested along a step, finer than any wall is thick (the pathfinding grid is 16 px). */
const SAMPLE_STEP_PX = 4

/** One person's budget of distance, kept between their messages. Not synced to anyone. */
export interface MovementBudget {
  allowance: number
  lastAt: number
}

export function newBudget(nowMs: number): MovementBudget {
  return { allowance: MAX_SPEED_PX_PER_SECOND * ALLOWANCE_SECONDS, lastAt: nowMs }
}

/** Whether an avatar can stand at `point`: a real number, inside the map, with its feet clear of every collider. */
export function isWalkable(point: Point, rules: MovementRules): boolean {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y))
    return false
  if (point.x < 0 || point.y < 0 || point.x > rules.mapWidth || point.y > rules.mapHeight)
    return false
  return !collidesWithAny(feetHitbox(point.x, point.y), rules.colliders)
}

function segmentIsClear(from: Point, to: Point, rules: MovementRules): boolean {
  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  const steps = Math.max(1, Math.ceil(distance / SAMPLE_STEP_PX))
  for (let step = 1; step <= steps; step++) {
    const t = step / steps
    if (collidesWithAny(feetHitbox(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t), rules.colliders))
      return false
  }
  return true
}

/**
 * Whether the avatar could have gone from `from` to `to` without crossing a wall. The client
 * moves one axis at a time, so a real step may be an L: it counts if the straight line or either
 * L (horizontal first, vertical first) is clear. Testing only the straight line would snap honest
 * players back when they round a corner.
 */
export function routeIsClear(from: Point, to: Point, rules: MovementRules): boolean {
  return segmentIsClear(from, to, rules)
    || (segmentIsClear(from, { x: to.x, y: from.y }, rules) && segmentIsClear({ x: to.x, y: from.y }, to, rules))
    || (segmentIsClear(from, { x: from.x, y: to.y }, rules) && segmentIsClear({ x: from.x, y: to.y }, to, rules))
}

/**
 * Decides whether a person who was at `from` can now be at `to` (issue #255), spending the
 * distance from their `budget`. The budget refills at the top speed of the server clock, so lag
 * and bursts of messages are fine, but a jump is not. A rejected move spends nothing.
 */
export function acceptMove(budget: MovementBudget, from: Point, to: Point, rules: MovementRules, nowMs: number): boolean {
  const elapsedSeconds = Math.max(0, nowMs - budget.lastAt) / 1000
  budget.lastAt = nowMs
  budget.allowance = Math.min(MAX_SPEED_PX_PER_SECOND * ALLOWANCE_SECONDS, budget.allowance + MAX_SPEED_PX_PER_SECOND * elapsedSeconds)

  if (!isWalkable(to, rules))
    return false

  const distance = Math.hypot(to.x - from.x, to.y - from.y)
  if (distance > budget.allowance + STEP_MARGIN_PX)
    return false
  if (!routeIsClear(from, to, rules))
    return false

  // May dip down to -STEP_MARGIN_PX: the margin is a loan, repaid by the refill, not free distance on every step.
  budget.allowance -= distance
  return true
}
