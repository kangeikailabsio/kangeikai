import { MovementController } from '$lib/game/input/movement-controller'
import { describe, expect, it } from 'vitest'

describe('movementController', () => {
  it('resolves opposing keys to a single consistent direction (FR-008)', () => {
    const controller = new MovementController()

    controller.press('left')
    expect(controller.getIntent().direction).toBe('left')

    controller.press('right')
    expect(controller.getIntent().direction).toBe('right')

    controller.release('right')
    expect(controller.getIntent().direction).toBe('left')

    controller.release('left')
    expect(controller.getIntent().direction).toBeNull()
  })

  it('stops movement when input focus is lost (FR-009)', () => {
    const controller = new MovementController()

    controller.press('up')
    expect(controller.getIntent().direction).toBe('up')

    controller.clear()
    expect(controller.getIntent().direction).toBeNull()
  })

  it('reports sprint only while a sprint key is held', () => {
    const controller = new MovementController()
    expect(controller.getIntent().sprint).toBe(false)

    controller.pressSprint()
    expect(controller.getIntent().sprint).toBe(true)

    controller.releaseSprint()
    expect(controller.getIntent().sprint).toBe(false)
  })

  it('clears sprint on focus loss along with direction', () => {
    const controller = new MovementController()

    controller.pressSprint()
    controller.clear()

    expect(controller.getIntent().sprint).toBe(false)
  })
})
