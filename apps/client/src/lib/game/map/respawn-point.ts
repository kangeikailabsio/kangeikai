export interface RespawnRect {
  x: number
  y: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

/**
 * Picks a spawn point from the map's `respawn` object layer: one object chosen uniformly at
 * random among however many exist, then a point uniformly random inside that object's
 * rectangle — spreads simultaneous joins across the area instead of stacking everyone on the
 * same pixel. Falls back to `fallback` (the caller's job to warn about) when there are no
 * respawn objects at all. `random` is injectable for deterministic tests; defaults to
 * `Math.random`.
 */
export function resolveRespawnPoint(objects: readonly RespawnRect[], fallback: Point, random: () => number = Math.random): Point {
  if (objects.length === 0) {
    return fallback
  }

  const index = Math.min(Math.floor(random() * objects.length), objects.length - 1)
  const object = objects[index]

  return {
    x: object.x + random() * object.width,
    y: object.y + random() * object.height,
  }
}
