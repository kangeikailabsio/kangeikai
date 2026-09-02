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
 */
export function findPath(grid: PathfindingGrid, start: WalkTarget, goal: WalkTarget): WalkTarget[] | null {
  const cellPath = searchCellPath(grid, cellAt(grid, start), cellAt(grid, goal))
  if (!cellPath) {
    return null
  }

  const waypoints: WalkTarget[] = [
    start,
    ...cellPath.slice(1, -1).map(cell => cellCenter(grid, cell)),
    goal,
  ]

  return simplifyPath(grid, waypoints).slice(1)
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

/** Cell-space A*, `start` always treated as walkable regardless of `grid.blocked` (the avatar is already standing there). */
function searchCellPath(grid: PathfindingGrid, start: Cell, goal: Cell): Cell[] | null {
  const startIndex = cellIndex(grid, start)
  const goalIndex = cellIndex(grid, goal)
  if (grid.blocked[goalIndex]) {
    return null
  }

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
      if (grid.blocked[neighborIndex]) {
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

/** Greedy line-of-sight shortcutting ("string pulling"): from each kept waypoint, skips ahead to the farthest later one still reachable in one straight "L" hop. */
function simplifyPath(grid: PathfindingGrid, waypoints: readonly WalkTarget[]): WalkTarget[] {
  if (waypoints.length <= 2) {
    return [...waypoints]
  }

  const simplified: WalkTarget[] = [waypoints[0]]
  let anchorIndex = 0
  for (let i = 1; i < waypoints.length; i++) {
    const isLast = i === waypoints.length - 1
    if (isLast || !canWalkDirectly(grid, waypoints[anchorIndex], waypoints[i + 1])) {
      simplified.push(waypoints[i])
      anchorIndex = i
    }
  }
  return simplified
}

/** Whether the avatar's actual one-axis-then-the-other walk from `a` to `b` (never a diagonal straight line) stays clear of every obstacle. */
function canWalkDirectly(grid: PathfindingGrid, a: WalkTarget, b: WalkTarget): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const corner: WalkTarget = Math.abs(dx) >= Math.abs(dy) ? { x: b.x, y: a.y } : { x: a.x, y: b.y }
  return isSegmentClear(grid, a, corner) && isSegmentClear(grid, corner, b)
}

/** `a`/`b` must share an x or y coordinate — sweeps every grid cell the axis-aligned segment between them crosses. */
function isSegmentClear(grid: PathfindingGrid, a: WalkTarget, b: WalkTarget): boolean {
  const cellA = cellAt(grid, a)
  const cellB = cellAt(grid, b)

  if (a.y === b.y) {
    const [from, to] = cellA.col <= cellB.col ? [cellA.col, cellB.col] : [cellB.col, cellA.col]
    for (let col = from; col <= to; col++) {
      if (grid.blocked[cellA.row * grid.cols + col]) {
        return false
      }
    }
    return true
  }

  const [from, to] = cellA.row <= cellB.row ? [cellA.row, cellB.row] : [cellB.row, cellA.row]
  for (let row = from; row <= to; row++) {
    if (grid.blocked[row * grid.cols + cellA.col]) {
      return false
    }
  }
  return true
}
