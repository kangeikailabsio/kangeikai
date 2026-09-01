import { DoubleClickDetector } from '$lib/game/input/double-click-detector'
import { describe, expect, it } from 'vitest'

describe('doubleClickDetector', () => {
  it('does not report a double-click on the first click', () => {
    const detector = new DoubleClickDetector()

    expect(detector.registerClick({ x: 10, y: 10 }, 0)).toBe(false)
  })

  it('reports a double-click when the second click is close in time and distance', () => {
    const detector = new DoubleClickDetector()

    detector.registerClick({ x: 10, y: 10 }, 0)

    expect(detector.registerClick({ x: 14, y: 12 }, 200)).toBe(true)
  })

  it('does not report a double-click when the second click is too slow', () => {
    const detector = new DoubleClickDetector()

    detector.registerClick({ x: 10, y: 10 }, 0)

    expect(detector.registerClick({ x: 10, y: 10 }, 500)).toBe(false)
  })

  it('does not report a double-click when the second click is too far away', () => {
    const detector = new DoubleClickDetector()

    detector.registerClick({ x: 10, y: 10 }, 0)

    expect(detector.registerClick({ x: 100, y: 10 }, 100)).toBe(false)
  })

  it('does not chain a third click into a second double-click on top of the last pair', () => {
    const detector = new DoubleClickDetector()

    detector.registerClick({ x: 10, y: 10 }, 0)
    detector.registerClick({ x: 10, y: 10 }, 100)

    expect(detector.registerClick({ x: 10, y: 10 }, 800)).toBe(false)
  })
})
