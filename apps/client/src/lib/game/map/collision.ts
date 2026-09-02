export interface CollisionRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Axis-aligned bounding box overlap, strict on all four sides. Explicitly guards zero-area rects
 * (the map's `collisions` layer has a stray zero-size object, likely an authoring slip in Tiled)
 * — without this, the strict overlap test below can still return true for one: e.g.
 * `rectsOverlap({x:0,y:0,w:10,h:10}, {x:5,y:5,w:0,h:0})` is `0<5 && 10>5 && 0<5 && 10>5` = true,
 * since a zero-width/-height rect's "span" is a single point, and a point strictly inside
 * another rect still satisfies every strict inequality. That's only invisible for a point sitting
 * exactly *on* another rect's edge (as in the tests below) — anywhere else inside a rect's
 * interior, an unguarded zero-area collider becomes a real, invisible obstacle. Reported live:
 * a pathfinding route was blocked by exactly this stray object, sitting in the middle of the
 * map's busiest corridor — Avatar's own per-frame movement checks rarely land a step's hitbox
 * squarely on that one exact point, but pathfinding's much denser positional sampling does.
 */
export function rectsOverlap(a: CollisionRect, b: CollisionRect): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) {
    return false
  }
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/** Whether `box` overlaps any of `obstacles`. */
export function collidesWithAny(box: CollisionRect, obstacles: readonly CollisionRect[]): boolean {
  return obstacles.some(obstacle => rectsOverlap(box, obstacle))
}
