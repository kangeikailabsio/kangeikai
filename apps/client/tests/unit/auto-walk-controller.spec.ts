import { AutoWalkController } from '$lib/game/input/auto-walk-controller'
import { describe, expect, it } from 'vitest'

describe('autoWalkController', () => {
  it('is inactive with a null intent until a target is set', () => {
    const controller = new AutoWalkController()

    expect(controller.active).toBe(false)
    expect(controller.getIntent(0, 0)).toEqual({ direction: null, sprint: false })
  })

  it('becomes active once a target is set, and inactive again once cancelled', () => {
    const controller = new AutoWalkController()

    controller.setTarget({ x: 100, y: 0 })
    expect(controller.active).toBe(true)

    controller.cancel()
    expect(controller.active).toBe(false)
  })

  it('picks the axis with the larger remaining distance, never sprinting', () => {
    const controller = new AutoWalkController()

    controller.setTarget({ x: 100, y: 10 })
    expect(controller.getIntent(0, 0)).toEqual({ direction: 'right', sprint: false })

    controller.setTarget({ x: 10, y: 100 })
    expect(controller.getIntent(0, 0)).toEqual({ direction: 'down', sprint: false })

    controller.setTarget({ x: -100, y: 0 })
    expect(controller.getIntent(0, 0)).toEqual({ direction: 'left', sprint: false })

    controller.setTarget({ x: 0, y: -100 })
    expect(controller.getIntent(0, 0)).toEqual({ direction: 'up', sprint: false })
  })

  it('self-cancels and returns a null intent once within arrival tolerance', () => {
    const controller = new AutoWalkController()
    controller.setTarget({ x: 2, y: -2 })

    const intent = controller.getIntent(0, 0)

    expect(intent).toEqual({ direction: null, sprint: false })
    expect(controller.active).toBe(false)
  })

  it('commits to the chosen axis until it resolves, instead of flickering every frame on a diagonal target', () => {
    const controller = new AutoWalkController()
    controller.setTarget({ x: 100, y: 100 })

    // Diagonal target (dx starts equal to dy): once "right" is picked, it must stay "right"
    // even as dy overtakes dx while x approaches — recomputing from scratch each frame used to
    // flip direction (and restart the walk animation) every single frame on a target like this.
    expect(controller.getIntent(0, 0).direction).toBe('right')
    expect(controller.getIntent(50, 0).direction).toBe('right')
    expect(controller.getIntent(90, 0).direction).toBe('right')

    // Only switches once the committed axis is actually resolved.
    expect(controller.getIntent(97, 0).direction).toBe('down')
    expect(controller.getIntent(97, 50).direction).toBe('down')
  })

  it('setPath behaves like setTarget for a single waypoint', () => {
    const controller = new AutoWalkController()

    controller.setPath([{ x: 100, y: 0 }])

    expect(controller.active).toBe(true)
    expect(controller.getIntent(0, 0)).toEqual({ direction: 'right', sprint: false })
  })

  it('setPath with no waypoints behaves like cancel', () => {
    const controller = new AutoWalkController()
    controller.setTarget({ x: 100, y: 0 })

    controller.setPath([])

    expect(controller.active).toBe(false)
  })

  it('advances to the next waypoint on arrival instead of going idle, staying active until the last one', () => {
    const controller = new AutoWalkController()
    controller.setPath([{ x: 100, y: 0 }, { x: 100, y: 100 }])

    // Arrives at the first waypoint this call (within tolerance) and immediately continues
    // toward the second, in the same call — no idle frame in between.
    expect(controller.getIntent(97, 0)).toEqual({ direction: 'down', sprint: false })
    expect(controller.active).toBe(true)

    // Still walking toward the second (and last) waypoint.
    expect(controller.getIntent(100, 50)).toEqual({ direction: 'down', sprint: false })
    expect(controller.active).toBe(true)

    // Arriving at the last waypoint self-cancels, same as a single setTarget.
    const finalIntent = controller.getIntent(100, 97)
    expect(finalIntent).toEqual({ direction: null, sprint: false })
    expect(controller.active).toBe(false)
  })

  it('setTarget after setPath drops any remaining queued waypoints', () => {
    const controller = new AutoWalkController()
    controller.setPath([{ x: 100, y: 0 }, { x: 100, y: 100 }])

    controller.setTarget({ x: 0, y: 0 })
    controller.getIntent(0, 0) // arrives immediately (already at 0,0)

    expect(controller.active).toBe(false)
  })
})
