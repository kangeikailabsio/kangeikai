export interface ClickPoint {
  x: number
  y: number
}

/** Phaser has no native double-click event — this is the same time-window + distance heuristic browsers use for `dblclick`. */
const DOUBLE_CLICK_WINDOW_MS = 300
const DOUBLE_CLICK_MAX_DISTANCE_PX = 12

/**
 * Pure double-click heuristic, decoupled from Phaser so it's unit-testable with fake
 * timestamps — no fake timers or DOM needed.
 */
export class DoubleClickDetector {
  private last: (ClickPoint & { at: number }) | undefined

  /** Returns true if this click forms a double-click with the immediately preceding one. */
  registerClick(point: ClickPoint, at: number): boolean {
    const isDouble = this.last !== undefined
      && at - this.last.at <= DOUBLE_CLICK_WINDOW_MS
      && Math.hypot(point.x - this.last.x, point.y - this.last.y) <= DOUBLE_CLICK_MAX_DISTANCE_PX

    this.last = { ...point, at }
    return isDouble
  }
}
