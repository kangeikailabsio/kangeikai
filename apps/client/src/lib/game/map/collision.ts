export interface CollisionRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Axis-aligned bounding box overlap, strict on all four sides — a zero-width or zero-height
 * rect (the map's `collisions` layer has one stray zero-size object) can never overlap
 * anything, so it harmlessly never blocks movement without needing to be special-cased.
 */
export function rectsOverlap(a: CollisionRect, b: CollisionRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** Whether `box` overlaps any of `obstacles`. */
export function collidesWithAny(box: CollisionRect, obstacles: readonly CollisionRect[]): boolean {
  return obstacles.some(obstacle => rectsOverlap(box, obstacle))
}
