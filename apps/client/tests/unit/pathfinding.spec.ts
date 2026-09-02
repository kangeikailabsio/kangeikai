import type { WalkTarget } from '$lib/game/input/auto-walk-controller'
import type { CollisionRect } from '$lib/game/map/collision'
import { Avatar, feetHitbox } from '$lib/game/entities/avatar'
import { AutoWalkController } from '$lib/game/input/auto-walk-controller'
import { collidesWithAny, rectsOverlap } from '$lib/game/map/collision'
import { buildPathfindingGrid, findPath } from '$lib/game/map/pathfinding'
import { describe, expect, it } from 'vitest'

const CELL_SIZE = 16
const MAP_SIZE = 320

/** Matches Avatar's real feet hitbox shape closely enough for these tests — a small centered box. */
function hitboxAt(x: number, y: number): CollisionRect {
  return { x: x - 10, y: y - 6, width: 20, height: 12 }
}

function path(colliders: CollisionRect[], start: WalkTarget, goal: WalkTarget) {
  const grid = buildPathfindingGrid(colliders, MAP_SIZE, MAP_SIZE, CELL_SIZE, hitboxAt)
  return findPath(grid, colliders, hitboxAt, start, goal)
}

/**
 * Precisely re-walks a returned path exactly as `AutoWalkController` really would — one axis
 * fully, then the other, per hop — sweeping the real hitbox at a fine step and checking real
 * collision the whole way, not through the pathfinding grid's cell-center approximation. Used to
 * assert the actual invariant that matters (never clips an obstacle), independent of how the
 * route was computed internally.
 */
function isPathWalkable(colliders: readonly CollisionRect[], hitbox: (x: number, y: number) => CollisionRect, start: WalkTarget, waypoints: readonly WalkTarget[]): boolean {
  let current = start
  for (const waypoint of waypoints) {
    const dx = waypoint.x - current.x
    const dy = waypoint.y - current.y
    const corner: WalkTarget = Math.abs(dx) >= Math.abs(dy) ? { x: waypoint.x, y: current.y } : { x: current.x, y: waypoint.y }
    if (!isHopClear(current, corner) || !isHopClear(corner, waypoint)) {
      return false
    }
    current = waypoint
  }
  return true

  function isHopClear(a: WalkTarget, b: WalkTarget): boolean {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2))
    for (let step = 0; step <= steps; step++) {
      const t = step / steps
      if (collidesWithAny(hitbox(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t), colliders)) {
        return false
      }
    }
    return true
  }
}

describe('findPath', () => {
  it('returns a direct single-waypoint path with no obstacles in the way', () => {
    expect(path([], { x: 20, y: 20 }, { x: 200, y: 20 })).toEqual([{ x: 200, y: 20 }])
  })

  it('returns null when the destination itself is inside a wall', () => {
    const wall: CollisionRect = { x: 90, y: 0, width: 20, height: MAP_SIZE }

    expect(path([wall], { x: 20, y: 160 }, { x: 100, y: 160 })).toBeNull()
  })

  it('returns null when the destination is fully walled off with no opening', () => {
    const wall: CollisionRect = { x: 150, y: 0, width: 20, height: MAP_SIZE }

    expect(path([wall], { x: 20, y: 160 }, { x: 300, y: 160 })).toBeNull()
  })

  it('routes around a wall through an opening instead of stopping at it', () => {
    // A wall splitting the map in two, with a gap around y=150-190 to walk through.
    const wallTop: CollisionRect = { x: 150, y: 0, width: 20, height: 150 }
    const wallBottom: CollisionRect = { x: 150, y: 190, width: 20, height: MAP_SIZE - 190 }
    const colliders = [wallTop, wallBottom]
    const start: WalkTarget = { x: 20, y: 20 }

    const result = path(colliders, start, { x: 300, y: 20 })

    expect(result).not.toBeNull()
    expect(result!.at(-1)).toEqual({ x: 300, y: 20 })
    // Must actually detour down through the gap and back up, not go straight across x=150-170.
    expect(result!.some(point => point.y > 100)).toBe(true)
    expect(isPathWalkable(colliders, hitboxAt, start, result!)).toBe(true)
  })

  it('simplifies the route to few waypoints instead of one per grid cell', () => {
    const wallTop: CollisionRect = { x: 150, y: 0, width: 20, height: 150 }
    const wallBottom: CollisionRect = { x: 150, y: 190, width: 20, height: MAP_SIZE - 190 }

    const result = path([wallTop, wallBottom], { x: 20, y: 20 }, { x: 300, y: 20 })

    // A raw per-cell path across ~300px at a 16px grid would be dozens of waypoints; routing
    // through one gap should collapse to a handful of turns.
    expect(result!.length).toBeLessThan(6)
  })

  it('ends exactly at the clicked point, not snapped to a cell center', () => {
    const result = path([], { x: 20, y: 20 }, { x: 137.5, y: 84.25 })

    expect(result!.at(-1)).toEqual({ x: 137.5, y: 84.25 })
  })

  it('reaches a destination whose grid cell reads as blocked only because the cell CENTER is close to an obstacle corner, when the exact clicked point is not actually blocked', () => {
    // A 32x32 obstacle occupying only the bottom-right corner of the 16px cell containing (98,98)
    // — that cell's center (104,104) collides with it (see buildPathfindingGrid), but (98,98)
    // itself, in the cell's open top-left corner, does not.
    const obstacle: CollisionRect = { x: 108, y: 108, width: 32, height: 32 }

    const result = path([obstacle], { x: 20, y: 20 }, { x: 98, y: 98 })

    expect(result).not.toBeNull()
    expect(result!.at(-1)).toEqual({ x: 98, y: 98 })
  })

  it('still returns null for a destination genuinely inside an obstacle, even near its corner', () => {
    const obstacle: CollisionRect = { x: 108, y: 108, width: 32, height: 32 }

    expect(path([obstacle], { x: 20, y: 20 }, { x: 120, y: 120 })).toBeNull()
  })

  it('never returns a route that clips an obstacle corner, even starting from an exact, off-grid point right next to it', () => {
    // Reported live: the avatar walked confidently toward the destination, then got stuck right
    // at a wall's corner. Root cause: the old simplification checked segments against the grid's
    // per-cell-center "blocked" flags, using whichever row/column an arbitrary point (like this
    // `start`, at a real avatar position, never a "nice" round number) happens to fall into —
    // but that row/column's flag only reflects its own center, not the exact point tested. This
    // exact start (found by sweeping many points against the pre-fix simplification) reproduces
    // it: the old code returned [{ x: 184, y: 104 }, { x: 300, y: 20 }], which clips wallTop's
    // corner on the first hop.
    const wallTop: CollisionRect = { x: 150, y: 0, width: 20, height: 150 }
    const wallBottom: CollisionRect = { x: 150, y: 190, width: 20, height: MAP_SIZE - 190 }
    const colliders = [wallTop, wallBottom]
    const start: WalkTarget = { x: 100, y: 184.6 }

    const result = path(colliders, start, { x: 300, y: 20 })

    expect(result).not.toBeNull()
    expect(isPathWalkable(colliders, hitboxAt, start, result!)).toBe(true)
  })
})

describe('findPath with a real desk collider and the real feetHitbox (regression, reported live)', () => {
  // A desk from welcome.tmj's collisions layer (id 4): x:[325,404.5] y:[339,372.75]. A person
  // clicking in the open space just above/left of it — exactly what was reported as
  // "unreachable" — lands at a point whose feetHitbox clears the desk, but whose 16px grid
  // cell's *center* doesn't (its feetHitbox's y-range dips down into the desk).
  const desk: CollisionRect = { x: 325, y: 339, width: 79.5, height: 33.75 }
  const grid = buildPathfindingGrid([desk], 3232, 2560, 16, feetHitbox)

  it('reaches the clicked point, not just its cell center', () => {
    const clickedPoint: WalkTarget = { x: 304, y: 304 }
    expect(rectsOverlap(feetHitbox(clickedPoint.x, clickedPoint.y), desk)).toBe(false) // the click itself is genuinely open...
    expect(grid.blocked[cellIndexFor(grid, clickedPoint)]).toBe(1) // ...even though its cell reads as blocked

    const result = findPath(grid, [desk], feetHitbox, { x: 320, y: 200 }, clickedPoint)

    expect(result).not.toBeNull()
    expect(result!.at(-1)).toEqual(clickedPoint)
  })

  function cellIndexFor(g: ReturnType<typeof buildPathfindingGrid>, point: WalkTarget): number {
    const col = Math.floor(point.x / g.cellSize)
    const row = Math.floor(point.y / g.cellSize)
    return row * g.cols + col
  }
})

describe('findPath with welcome.tmj\'s stray zero-size collider (regression, reported live)', () => {
  // welcome.tmj's collisions layer has one degenerate object, `{ x: 414, y: 2139, width: 0,
  // height: 0 }` — almost certainly a Tiled authoring slip, sitting right in the middle of the
  // corridor between the map's two entrance walls. `rectsOverlap`'s strict-inequality math alone
  // can still report a collision against a zero-area rect whenever another box's interior
  // strictly contains that single point (see collision.spec.ts) — which a plain per-frame avatar
  // step rarely lands on exactly, but pathfinding's much denser sampling does. The avatar visibly
  // "walked confidently then got stuck" right by the entrance walls, which read as clipping their
  // corner, but was actually this single stray point in the middle of the gap between them.
  const wallBottomLeft: CollisionRect = { x: 3, y: 2229, width: 249, height: 40 }
  const wallBottomRight: CollisionRect = { x: 448, y: 2226, width: 233, height: 45 }
  const wallTopLeft: CollisionRect = { x: 1, y: 2015, width: 252, height: 61 }
  const wallTopRight: CollisionRect = { x: 448.667, y: 2017.33, width: 669, height: 58 }
  const strayPoint: CollisionRect = { x: 414, y: 2139, width: 0, height: 0 }
  const colliders = [wallBottomLeft, wallBottomRight, wallTopLeft, wallTopRight, strayPoint]

  it('routes through the entrance gap without clipping the stray point', () => {
    const start: WalkTarget = { x: 419.5, y: 354 }
    const goal: WalkTarget = { x: 403, y: 2226 }
    const grid = buildPathfindingGrid(colliders, 2560, 2560, CELL_SIZE, hitboxAt)

    const result = findPath(grid, colliders, hitboxAt, start, goal)

    expect(result).not.toBeNull()
    expect(isPathWalkable(colliders, hitboxAt, start, result!)).toBe(true)
  })
})

describe('findPath leaves enough real clearance for AutoWalkController to actually complete a route (regression, reported live)', () => {
  // Reported live (with a frame-by-frame trace): the avatar walked confidently around a wall's
  // corner, then got permanently stuck a step later. Root cause: a waypoint was validated with
  // only ~0.3px of real clearance from the wall — enough to pass an exact-coordinate check, but
  // AutoWalkController only guarantees stopping *within* ARRIVAL_TOLERANCE_PX (4px) of a
  // waypoint before committing to the next axis, not exactly on it. The avatar's real stop
  // position landed ~1.6px short of the waypoint — just enough to turn "barely clear" into
  // "colliding" — and it was then stuck forever trying to move into that same collider every
  // frame. findPath now pads its clearance checks by that same tolerance, so every waypoint it
  // returns has enough real margin for the avatar to actually complete the hop, not just enough
  // for the exact waypoint coordinate to check out on paper.
  const wallTopRight: CollisionRect = { x: 448.667, y: 2017.33, width: 669, height: 58 }
  const colliders = [wallTopRight]
  const start: WalkTarget = { x: 1086.4, y: 2098.8 }
  const goal: WalkTarget = { x: 1090, y: 1980 }

  it('completes the route end to end via the real AutoWalkController + Avatar, not just on paper', () => {
    const grid = buildPathfindingGrid(colliders, 3232, 2560, CELL_SIZE, feetHitbox)
    const path = findPath(grid, colliders, feetHitbox, start, goal)
    expect(path).not.toBeNull()

    const avatar = new Avatar(start.x, start.y, 'man', 3232, 2560)
    avatar.setColliders(colliders)
    const controller = new AutoWalkController()
    controller.setPath(path!)

    const DELTA_SECONDS = 1 / 60
    for (let frame = 0; frame < 600 && controller.active; frame++) {
      const intent = controller.getIntent(avatar.x, avatar.y)
      avatar.update(intent, DELTA_SECONDS)
    }

    expect(controller.active).toBe(false) // arrived, rather than stuck forever
    expect(Math.hypot(avatar.x - goal.x, avatar.y - goal.y)).toBeLessThan(10)
  })
})
