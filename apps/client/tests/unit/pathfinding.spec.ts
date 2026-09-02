import type { WalkTarget } from '$lib/game/input/auto-walk-controller'
import type { CollisionRect } from '$lib/game/map/collision'
import { feetHitbox } from '$lib/game/entities/avatar'
import { rectsOverlap } from '$lib/game/map/collision'
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

    const result = path([wallTop, wallBottom], { x: 20, y: 20 }, { x: 300, y: 20 })

    expect(result).not.toBeNull()
    expect(result!.at(-1)).toEqual({ x: 300, y: 20 })
    // Must actually detour down through the gap and back up, not go straight across x=150-170.
    expect(result!.some(point => point.y > 100)).toBe(true)
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
})

describe('findPath with a real desk collider and the real feetHitbox (regression, reported live)', () => {
  // A desk from welcome.tmj's collisions layer (id 4): x:[325,404.5] y:[339,372.75]. A person
  // clicking in the open space just above/left of it — exactly what was reported as
  // "unreachable" — lands at a point whose feetHitbox clears the desk, but whose 16px grid
  // cell's *center* doesn't (its feetHitbox's y-range dips down into the desk).
  const desk: CollisionRect = { x: 325, y: 339, width: 79.5, height: 33.75 }
  const grid = buildPathfindingGrid([desk], 3232, 2560, 16, feetHitbox)

  it('reaches the clicked point, not just its cell center', () => {
    const clickedPoint: WalkTarget = { x: 320, y: 305 }
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
