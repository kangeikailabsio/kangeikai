export interface ApproachPoint {
  x: number
  y: number
}

/**
 * A point `standoffPx` short of `target`, along the straight line from `from` to `target` — so
 * walking there stops just shy of `target` instead of the two avatars stacking on top of each
 * other. `null` when `from` is already within `standoffPx` of `target` (nothing to walk toward).
 * Shared by "Go to" (#159) and "Follow" (#160) — both need the exact same "approach, don't
 * overlap" math, just with a different `standoffPx`.
 */
export function resolveApproachPoint(from: ApproachPoint, target: ApproachPoint, standoffPx: number): ApproachPoint | null {
  const dx = target.x - from.x
  const dy = target.y - from.y
  const distance = Math.hypot(dx, dy)
  if (distance <= standoffPx) {
    return null
  }

  const ratio = (distance - standoffPx) / distance
  return { x: from.x + dx * ratio, y: from.y + dy * ratio }
}
