export type MovementDirection = 'up' | 'down' | 'left' | 'right'

export interface MovementIntent {
  direction: MovementDirection | null
  /** Whether a sprint modifier (either Shift key) is currently held. */
  sprint: boolean
}

/**
 * Pure keyboard-state tracker, decoupled from Phaser's input system so it's unit-testable
 * without a canvas/DOM context (research.md). Resolves opposing keys (FR-008) by direction
 * press order: the most recently pressed still-held direction wins, so releasing it falls back
 * to whichever direction was held before, with no jitter.
 */
export class MovementController {
  private heldOrder: MovementDirection[] = []
  private sprintHeld = false

  press(direction: MovementDirection): void {
    if (!this.heldOrder.includes(direction)) {
      this.heldOrder.push(direction)
    }
  }

  release(direction: MovementDirection): void {
    this.heldOrder = this.heldOrder.filter(held => held !== direction)
  }

  pressSprint(): void {
    this.sprintHeld = true
  }

  releaseSprint(): void {
    this.sprintHeld = false
  }

  /** Called on focus loss (FR-009) so no key is left "stuck" held. */
  clear(): void {
    this.heldOrder = []
    this.sprintHeld = false
  }

  getIntent(): MovementIntent {
    return {
      direction: this.heldOrder.at(-1) ?? null,
      sprint: this.sprintHeld,
    }
  }
}
