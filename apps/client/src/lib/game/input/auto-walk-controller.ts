import type { MovementIntent } from '$lib/game/input/movement-controller'

export interface WalkTarget {
  x: number
  y: number
}

/**
 * Close enough to the target to stop, rather than keep seeking the exact pixel — Avatar moves
 * a fixed distance per frame (SPEED_PX_PER_SECOND * deltaSeconds), so a target within one
 * frame's travel distance would otherwise get endlessly overshot and re-approached.
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

  get active(): boolean {
    return this.target !== undefined
  }

  setTarget(target: WalkTarget): void {
    this.target = target
  }

  cancel(): void {
    this.target = undefined
  }

  /** Picks whichever axis has the larger remaining distance; self-cancels on arrival. */
  getIntent(x: number, y: number): MovementIntent {
    if (!this.target) {
      return { direction: null, sprint: false }
    }

    const dx = this.target.x - x
    const dy = this.target.y - y

    if (Math.abs(dx) <= ARRIVAL_TOLERANCE_PX && Math.abs(dy) <= ARRIVAL_TOLERANCE_PX) {
      this.target = undefined
      return { direction: null, sprint: false }
    }

    const direction = Math.abs(dx) >= Math.abs(dy)
      ? (dx > 0 ? 'right' : 'left')
      : (dy > 0 ? 'down' : 'up')

    return { direction, sprint: false }
  }
}
