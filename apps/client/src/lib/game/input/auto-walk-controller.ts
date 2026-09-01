import type { MovementDirection, MovementIntent } from '$lib/game/input/movement-controller'

export interface WalkTarget {
  x: number
  y: number
}

/**
 * Close enough to the target (or to having closed the committed axis, see `axis` below) to
 * stop/switch, rather than keep seeking the exact pixel — Avatar moves a fixed distance per
 * frame (SPEED_PX_PER_SECOND * deltaSeconds), so a smaller-than-that remaining distance would
 * otherwise get endlessly overshot and re-approached.
 */
const ARRIVAL_TOLERANCE_PX = 4

/**
 * Pure alternate source of `MovementIntent` (mirrors `MovementController`'s shape, decoupled
 * from Phaser) — given the avatar's current position, walks it toward a target one axis per
 * frame, matching `Avatar.update()`'s existing single-axis-per-frame model exactly, so no
 * change to `Avatar`/`collision.ts` is needed for click-to-move to work.
 */
export class AutoWalkController {
  private target: WalkTarget | undefined
  /**
   * Once chosen, kept until that axis is within tolerance — recomputing "which axis has more
   * distance left" fresh every single frame flickers between axes on a near-diagonal target
   * (both shrink at a similar rate), and every flip restarts the walk animation from frame 0,
   * looking glitchy even though the underlying position is moving fine. Committing to one axis
   * until it's resolved instead produces one clean "L" turn.
   */
  private axis: 'x' | 'y' | undefined

  get active(): boolean {
    return this.target !== undefined
  }

  setTarget(target: WalkTarget): void {
    this.target = target
    this.axis = undefined
  }

  cancel(): void {
    this.target = undefined
    this.axis = undefined
  }

  getIntent(x: number, y: number): MovementIntent {
    if (!this.target) {
      return { direction: null, sprint: false }
    }

    const dx = this.target.x - x
    const dy = this.target.y - y

    if (Math.abs(dx) <= ARRIVAL_TOLERANCE_PX && Math.abs(dy) <= ARRIVAL_TOLERANCE_PX) {
      this.cancel()
      return { direction: null, sprint: false }
    }

    if (this.axis === 'x' && Math.abs(dx) <= ARRIVAL_TOLERANCE_PX) {
      this.axis = undefined
    }
    else if (this.axis === 'y' && Math.abs(dy) <= ARRIVAL_TOLERANCE_PX) {
      this.axis = undefined
    }
    if (!this.axis) {
      this.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
    }

    const direction: MovementDirection = this.axis === 'x'
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up')

    return { direction, sprint: false }
  }
}
