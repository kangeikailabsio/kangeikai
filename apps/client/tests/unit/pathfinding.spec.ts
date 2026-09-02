import type { CollisionRect } from '$lib/game/map/collision'
import { buildPathfindingGrid, findPath } from '$lib/game/map/pathfinding'
import { describe, expect, it } from 'vitest'

const CELL_SIZE = 16
const MAP_SIZE = 320

/** Matches Avatar's real feet hitbox shape closely enough for these tests — a small centered box. */
function hitboxAt(x: number, y: number): CollisionRect {
  return { x: x - 10, y: y - 6, width: 20, height: 12 }
}

function grid(colliders: CollisionRect[]) {
  return buildPathfindingGrid(colliders, MAP_SIZE, MAP_SIZE, CELL_SIZE, hitboxAt)
}

describe('findPath', () => {
  it('returns a direct single-waypoint path with no obstacles in the way', () => {
    const path = findPath(grid([]), { x: 20, y: 20 }, { x: 200, y: 20 })

    expect(path).toEqual([{ x: 200, y: 20 }])
  })

  it('returns null when the destination itself is inside a wall', () => {
    const wall: CollisionRect = { x: 90, y: 0, width: 20, height: MAP_SIZE }

    const path = findPath(grid([wall]), { x: 20, y: 160 }, { x: 100, y: 160 })

    expect(path).toBeNull()
  })

  it('returns null when the destination is fully walled off with no opening', () => {
    const wall: CollisionRect = { x: 150, y: 0, width: 20, height: MAP_SIZE }

    const path = findPath(grid([wall]), { x: 20, y: 160 }, { x: 300, y: 160 })

    expect(path).toBeNull()
  })

  it('routes around a wall through an opening instead of stopping at it', () => {
    // A wall splitting the map in two, with a gap around y=150-190 to walk through.
    const wallTop: CollisionRect = { x: 150, y: 0, width: 20, height: 150 }
    const wallBottom: CollisionRect = { x: 150, y: 190, width: 20, height: MAP_SIZE - 190 }

    const path = findPath(grid([wallTop, wallBottom]), { x: 20, y: 20 }, { x: 300, y: 20 })

    expect(path).not.toBeNull()
    expect(path!.at(-1)).toEqual({ x: 300, y: 20 })
    // Must actually detour down through the gap and back up, not go straight across x=150-170.
    expect(path!.some(point => point.y > 100)).toBe(true)
  })

  it('simplifies the route to few waypoints instead of one per grid cell', () => {
    const wallTop: CollisionRect = { x: 150, y: 0, width: 20, height: 150 }
    const wallBottom: CollisionRect = { x: 150, y: 190, width: 20, height: MAP_SIZE - 190 }

    const path = findPath(grid([wallTop, wallBottom]), { x: 20, y: 20 }, { x: 300, y: 20 })

    // A raw per-cell path across ~300px at a 16px grid would be dozens of waypoints; routing
    // through one gap should collapse to a handful of turns.
    expect(path!.length).toBeLessThan(6)
  })

  it('ends exactly at the clicked point, not snapped to a cell center', () => {
    const path = findPath(grid([]), { x: 20, y: 20 }, { x: 137.5, y: 84.25 })

    expect(path!.at(-1)).toEqual({ x: 137.5, y: 84.25 })
  })
})
