import { FollowController } from '$lib/game/input/follow-controller'
import { describe, expect, it } from 'vitest'

describe('followController', () => {
  it('is inactive until started', () => {
    const controller = new FollowController()

    expect(controller.active).toBe(false)
    expect(controller.targetSessionId).toBeUndefined()
  })

  it('becomes active with the given sessionId once started, and inactive again once stopped', () => {
    const controller = new FollowController()

    controller.start('alice')
    expect(controller.active).toBe(true)
    expect(controller.targetSessionId).toBe('alice')

    controller.stop()
    expect(controller.active).toBe(false)
    expect(controller.targetSessionId).toBeUndefined()
  })

  it('starting on a new sessionId replaces whichever one was previously followed', () => {
    const controller = new FollowController()

    controller.start('alice')
    controller.start('bob')

    expect(controller.targetSessionId).toBe('bob')
  })

  it('should recalculate before the very first recalculation, regardless of position', () => {
    const controller = new FollowController()
    controller.start('alice')

    expect(controller.shouldRecalculate({ x: 0, y: 0 }, 100)).toBe(true)
  })

  it('should not recalculate once the target is within the threshold of the last recalculated position', () => {
    const controller = new FollowController()
    controller.start('alice')
    controller.recalculated({ x: 0, y: 0 })

    expect(controller.shouldRecalculate({ x: 10, y: 0 }, 24)).toBe(false)
    expect(controller.shouldRecalculate({ x: 24, y: 0 }, 24)).toBe(false)
  })

  it('should recalculate once the target has moved past the threshold', () => {
    const controller = new FollowController()
    controller.start('alice')
    controller.recalculated({ x: 0, y: 0 })

    expect(controller.shouldRecalculate({ x: 25, y: 0 }, 24)).toBe(true)
  })

  it('measures the threshold from the last recalculated position, not the original start', () => {
    const controller = new FollowController()
    controller.start('alice')
    controller.recalculated({ x: 0, y: 0 })
    controller.recalculated({ x: 100, y: 0 })

    // Close to the second recalculated position, even though far from the first.
    expect(controller.shouldRecalculate({ x: 110, y: 0 }, 24)).toBe(false)
  })

  it('resets the recalculation baseline on a fresh start', () => {
    const controller = new FollowController()
    controller.start('alice')
    controller.recalculated({ x: 0, y: 0 })

    controller.start('bob')

    expect(controller.shouldRecalculate({ x: 0, y: 0 }, 24)).toBe(true)
  })
})
