import type { WalkTarget } from '$lib/game/input/auto-walk-controller'
import type { CollisionRect } from '$lib/game/map/collision'
import { collidesWithAny } from '$lib/game/map/collision'

interface Cell {
  col: number
  row: number
}

export interface PathfindingGrid {
  readonly cellSize: number
  readonly cols: number
  readonly rows: number
  /** `1` at `row * cols + col` if that cell's center collides with an obstacle, else `0`. */
  readonly blocked: Uint8Array
}

/**
 * Discretizes the map into `cellSize`-px cells for pathfinding (#92), each marked blocked if a
 * hitbox centered on it (via `hitboxAt`, e.g. `Avatar`'s `feetHitbox`) collides with any of
 * `colliders`. Reusing the real movement hitbox here — rather than a coarser "does any part of a
 * collision rect touch this cell" test — means the grid's notion of "blocked" always matches what
 * would actually stop the avatar, so `findPath` can never return a route that isn't really
 * walkable. Built once per map load; the static `collisions` layer never changes at runtime.
 */
export function buildPathfindingGrid(
  colliders: readonly CollisionRect[],
  mapWidthPx: number,
  mapHeightPx: number,
  cellSize: number,
  hitboxAt: (x: number, y: number) => CollisionRect,
): PathfindingGrid {
  const cols = Math.max(1, Math.ceil(mapWidthPx / cellSize))
  const rows = Math.max(1, Math.ceil(mapHeightPx / cellSize))
  const blocked = new Uint8Array(cols * rows)

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * cellSize + cellSize / 2
      const y = row * cellSize + cellSize / 2
      if (collidesWithAny(hitboxAt(x, y), colliders)) {
        blocked[row * cols + col] = 1
      }
    }
  }

  return { cellSize, cols, rows, blocked }
}

/**
 * A route from `start` to `goal` that avoids every blocked cell (4-directional A*, matching the
 * avatar's one-axis-at-a-time movement — there's no true diagonal to route through), or `null` if
 * none exists (`goal` is walled off with no open path — #92's "not accessible" case). The raw
 * per-cell route is simplified into the fewest waypoints that still avoid every obstacle, each
 * hop still a straight one-axis-then-the-other "L" walk — a raw route would otherwise place a
 * waypoint every `cellSize` px, visibly "staircasing" through any diagonal-ish corridor. Doesn't
 * include `start` itself — like `AutoWalkController.setTarget`, this is a list of places to walk
 * to, not including where the avatar already is.
 *
 * `colliders`/`hitboxAt` (the same pair `grid` was built from) are used once here, to test
 * `goal`'s exact clicked point directly rather than trusting the grid's cell-center approximation
 * for it: a click landing close to an obstacle's corner can fall in a cell whose center reads as
 * blocked even though the actual clicked pixel is open — the grid's resolution (`cellSize`) is a
 * reasonable tradeoff for the route in general, but the one point a person actually clicked
 * deserves an exact answer, not an approximated one.
 */
export function findPath(
  grid: PathfindingGrid,
  colliders: readonly CollisionRect[],
  hitboxAt: (x: number, y: number) => CollisionRect,
  start: WalkTarget,
  goal: WalkTarget,
): WalkTarget[] | null {
  if (collidesWithAny(hitboxAt(goal.x, goal.y), colliders)) {
    return null
  }

  const cellPath = searchCellPath(grid, cellAt(grid, start), cellAt(grid, goal))
  if (!cellPath) {
    return null
  }

  const waypoints: WalkTarget[] = [
    start,
    ...cellPath.slice(1, -1).map(cell => cellCenter(grid, cell)),
    goal,
  ]

  return simplifyPath(colliders, hitboxAt, waypoints).slice(1)
}

const NEIGHBOR_OFFSETS: ReadonlyArray<{ dc: number, dr: number }> = [
  { dc: 1, dr: 0 },
  { dc: -1, dr: 0 },
  { dc: 0, dr: 1 },
  { dc: 0, dr: -1 },
]

function cellAt(grid: PathfindingGrid, point: WalkTarget): Cell {
  return {
    col: clampInt(Math.floor(point.x / grid.cellSize), 0, grid.cols - 1),
    row: clampInt(Math.floor(point.y / grid.cellSize), 0, grid.rows - 1),
  }
}

function cellCenter(grid: PathfindingGrid, cell: Cell): WalkTarget {
  return {
    x: cell.col * grid.cellSize + grid.cellSize / 2,
    y: cell.row * grid.cellSize + grid.cellSize / 2,
  }
}

function cellIndex(grid: PathfindingGrid, cell: Cell): number {
  return cell.row * grid.cols + cell.col
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function heuristic(a: Cell, b: Cell, cellSize: number): number {
  return (Math.abs(a.col - b.col) + Math.abs(a.row - b.row)) * cellSize
}

/**
 * Binary min-heap keyed by `priority` — the open set for `searchCellPath`'s A*. A plain
 * "scan for the minimum" open set would be fine correctness-wise, but degrades badly on a map
 * this grid-dense (tens of thousands of cells) whenever a route has to search widely (e.g. no
 * route exists at all, or the goal is deep behind a maze-like layout).
 */
class MinHeap<T> {
  private readonly items: { priority: number, value: T }[] = []

  get size(): number {
    return this.items.length
  }

  push(value: T, priority: number): void {
    this.items.push({ value, priority })
    let index = this.items.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (this.items[parent].priority <= this.items[index].priority) {
        break
      }
      ;[this.items[parent], this.items[index]] = [this.items[index], this.items[parent]]
      index = parent
    }
  }

  pop(): T | undefined {
    const top = this.items[0]
    if (!top) {
      return undefined
    }
    const last = this.items.pop()!
    if (this.items.length > 0) {
      this.items[0] = last
      let index = 0
      for (;;) {
        const left = index * 2 + 1
        const right = index * 2 + 2
        let smallest = index
        if (left < this.items.length && this.items[left].priority < this.items[smallest].priority) {
          smallest = left
        }
        if (right < this.items.length && this.items[right].priority < this.items[smallest].priority) {
          smallest = right
        }
        if (smallest === index) {
          break
        }
        ;[this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]]
        index = smallest
      }
    }
    return top.value
  }
}

/**
 * Cell-space A*. `start` and `goal` are always treated as walkable regardless of `grid.blocked`
 * — the avatar is already standing at `start`, and `findPath` has already verified `goal`'s exact
 * point precisely (not through the grid's cell-center approximation) before calling this.
 */
function searchCellPath(grid: PathfindingGrid, start: Cell, goal: Cell): Cell[] | null {
  const startIndex = cellIndex(grid, start)
  const goalIndex = cellIndex(grid, goal)

  const cellCount = grid.cols * grid.rows
  const cameFrom = new Int32Array(cellCount).fill(-1)
  const gScore = new Float64Array(cellCount).fill(Infinity)
  const visited = new Uint8Array(cellCount)
  gScore[startIndex] = 0

  const open = new MinHeap<number>()
  open.push(startIndex, heuristic(start, goal, grid.cellSize))

  for (let currentIndex = open.pop(); currentIndex !== undefined; currentIndex = open.pop()) {
    if (visited[currentIndex]) {
      continue
    }
    visited[currentIndex] = 1

    if (currentIndex === goalIndex) {
      return reconstructPath(grid, cameFrom, currentIndex)
    }

    const current: Cell = { col: currentIndex % grid.cols, row: Math.floor(currentIndex / grid.cols) }
    for (const { dc, dr } of NEIGHBOR_OFFSETS) {
      const col = current.col + dc
      const row = current.row + dr
      if (col < 0 || col >= grid.cols || row < 0 || row >= grid.rows) {
        continue
      }
      const neighborIndex = row * grid.cols + col
      if (neighborIndex !== goalIndex && grid.blocked[neighborIndex]) {
        continue
      }
      const tentativeG = gScore[currentIndex] + grid.cellSize
      if (tentativeG < gScore[neighborIndex]) {
        gScore[neighborIndex] = tentativeG
        cameFrom[neighborIndex] = currentIndex
        open.push(neighborIndex, tentativeG + heuristic({ col, row }, goal, grid.cellSize))
      }
    }
  }

  return null
}

function reconstructPath(grid: PathfindingGrid, cameFrom: Int32Array, endIndex: number): Cell[] {
  const path: Cell[] = []
  for (let index = endIndex; index !== -1; index = cameFrom[index]) {
    path.push({ col: index % grid.cols, row: Math.floor(index / grid.cols) })
  }
  path.reverse()
  return path
}

/**
 * Longest step (in px) between samples when precisely sweeping a segment for
 * `canWalkDirectly`/`isSegmentClear` — well under the avatar's feet hitbox's smaller dimension
 * (`COLLISION_HITBOX_HEIGHT`, 12px in avatar.ts), so no obstacle edge along the way can be
 * skipped over between two consecutive sample points.
 */
const SEGMENT_SAMPLE_STEP_PX = 4

/**
 * Greedy line-of-sight shortcutting ("string pulling"): from each kept waypoint, skips ahead to
 * the farthest later one still reachable in one straight "L" hop, checking the exact segments
 * against `colliders` directly (not `grid`'s cell-center approximation — see `isSegmentClear`).
 *
 * Every hop that ends up in the returned list is explicitly verified via `canWalkDirectly` —
 * deliberately never assumed safe just because it's one raw, single A* step between two
 * originally-adjacent waypoints. That assumption *would* hold between two grid-cell-center
 * waypoints (their shared row/column is exactly that row/column's own center, by construction),
 * but `waypoints[0]`/`waypoints[waypoints.length - 1]` are `start`/`goal` themselves — arbitrary,
 * essentially never cell-centered points (a real avatar position, a real click) — and skipping
 * their validation is exactly what let the avatar clip a wall's corner on its very first or last
 * leg, reported live twice over (first found to be imprecise, then found to be entirely
 * unchecked).
 */
function simplifyPath(colliders: readonly CollisionRect[], hitboxAt: (x: number, y: number) => CollisionRect, waypoints: readonly WalkTarget[]): WalkTarget[] {
  if (waypoints.length === 0) {
    return []
  }

  const simplified: WalkTarget[] = [waypoints[0]]
  let anchorIndex = 0

  while (anchorIndex < waypoints.length - 1) {
    let farthest = anchorIndex
    for (let candidate = anchorIndex + 1; candidate < waypoints.length; candidate++) {
      if (canWalkDirectly(colliders, hitboxAt, waypoints[anchorIndex], waypoints[candidate])) {
        farthest = candidate
        continue
      }
      if (farthest === anchorIndex) {
        // Not even the immediate next raw waypoint validates directly from the anchor — can only
        // happen right next to `start`/`goal` (see above); take it anyway as the best available
        // step. The per-frame "stuck" fallback (office-scene.ts) covers this residual case.
        farthest = candidate
      }
      break
    }
    simplified.push(waypoints[farthest])
    anchorIndex = farthest
  }

  return simplified
}

/** Whether the avatar's actual one-axis-then-the-other walk from `a` to `b` (never a diagonal straight line) stays clear of every obstacle. */
function canWalkDirectly(colliders: readonly CollisionRect[], hitboxAt: (x: number, y: number) => CollisionRect, a: WalkTarget, b: WalkTarget): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const corner: WalkTarget = Math.abs(dx) >= Math.abs(dy) ? { x: b.x, y: a.y } : { x: a.x, y: b.y }
  return isSegmentClear(colliders, hitboxAt, a, corner) && isSegmentClear(colliders, hitboxAt, corner, b)
}

/** Sweeps the avatar's real hitbox along the (axis-aligned) segment from `a` to `b` at `SEGMENT_SAMPLE_STEP_PX` steps, checking real collision at each. */
function isSegmentClear(colliders: readonly CollisionRect[], hitboxAt: (x: number, y: number) => CollisionRect, a: WalkTarget, b: WalkTarget): boolean {
  const distance = Math.hypot(b.x - a.x, b.y - a.y)
  const steps = Math.max(1, Math.ceil(distance / SEGMENT_SAMPLE_STEP_PX))

  for (let step = 0; step <= steps; step++) {
    const t = step / steps
    const x = a.x + (b.x - a.x) * t
    const y = a.y + (b.y - a.y) * t
    if (collidesWithAny(hitboxAt(x, y), colliders)) {
      return false
    }
  }
  return true
}
