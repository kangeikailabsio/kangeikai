export interface FollowTargetPosition {
  x: number
  y: number
}

/**
 * Pure "when should Follow (#160) recompute its route" tracker, decoupled from Phaser like
 * `AutoWalkController` — owns only which sessionId is being followed and where that avatar was
 * the last time a route was actually recalculated toward it, not the walking itself (still
 * `AutoWalkController`, driven by `OfficeScene`).
 */
export class FollowController {
  private sessionId: string | undefined
  private lastRecalculatedPosition: FollowTargetPosition | undefined

  get active(): boolean {
    return this.sessionId !== undefined
  }

  get targetSessionId(): string | undefined {
    return this.sessionId
  }

  start(sessionId: string): void {
    this.sessionId = sessionId
    this.lastRecalculatedPosition = undefined
  }

  stop(): void {
    this.sessionId = undefined
    this.lastRecalculatedPosition = undefined
  }

  /**
   * `true` before any recalculation has happened yet for the current follow (so the very first
   * route always gets computed), or once `targetPosition` has moved more than `thresholdPx` from
   * where the route was last recalculated — never on every frame regardless of movement, per the
   * issue's grill (avoids thrashing `findPath`/`setPath`).
   */
  shouldRecalculate(targetPosition: FollowTargetPosition, thresholdPx: number): boolean {
    if (!this.lastRecalculatedPosition) {
      return true
    }
    const dx = targetPosition.x - this.lastRecalculatedPosition.x
    const dy = targetPosition.y - this.lastRecalculatedPosition.y
    return Math.hypot(dx, dy) > thresholdPx
  }

  /** Records `targetPosition` as the new recalculation baseline — call after acting on `shouldRecalculate`. */
  recalculated(targetPosition: FollowTargetPosition): void {
    this.lastRecalculatedPosition = targetPosition
  }
}
