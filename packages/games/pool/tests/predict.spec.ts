import type { Ball } from '@kangeikai/game-pool/physics'
import type { PredictionInput } from '@kangeikai/game-pool/predict'
import { emptyReport, FIXED_STEP, stepPhysics } from '@kangeikai/game-pool/physics'
import { clampOffset, createPrediction, decayFactor, MAX_PREDICTION_MS, MAX_VISUAL_ERROR, nearestPocket, SINK_MS } from '@kangeikai/game-pool/predict'
import { describe, expect, it } from 'vitest'

function ball(id: number, x: number, y: number, vx = 0, vy = 0, pocketed = false): Ball {
  return { id, x, y, vx, vy, pocketed }
}

function input(balls: Ball[], overrides: Partial<PredictionInput> = {}): PredictionInput {
  return { matchId: 1, turnId: 1, phase: 'moving', balls: balls.map(b => ({ ...b })), ...overrides }
}

function frameOf(prediction: ReturnType<typeof createPrediction>, id: number) {
  return prediction.frames().find(frame => frame.id === id)
}

describe('decay and clamping', () => {
  it('decays frame-rate independently', () => {
    const once = decayFactor(100)
    let stepped = 1
    for (let i = 0; i < 10; i++)
      stepped *= decayFactor(10)
    expect(stepped).toBeCloseTo(once, 10)
  })

  it('leaves a small offset untouched and clamps a large one to the cap', () => {
    expect(clampOffset(3, 4)).toEqual({ x: 3, y: 4 })
    const clamped = clampOffset(300, 400)
    expect(Math.hypot(clamped.x, clamped.y)).toBeCloseTo(MAX_VISUAL_ERROR)
    // Direction is preserved — only the magnitude is capped.
    expect(clamped.x / clamped.y).toBeCloseTo(3 / 4)
    expect(clampOffset(0, 0)).toEqual({ x: 0, y: 0 })
  })

  it('finds the pocket a ball actually fell into', () => {
    expect(nearestPocket(10, 10)).toEqual({ x: 0, y: 0 })
    expect(nearestPocket(790, 390)).toEqual({ x: 800, y: 400 })
    expect(nearestPocket(400, 12)).toEqual({ x: 400, y: 0 })
  })
})

describe('snapshot adoption', () => {
  it('keeps the rendered position continuous across an adoption that disagrees', () => {
    const prediction = createPrediction()
    prediction.adopt(input([ball(0, 100, 200, 200, 0)]))
    prediction.advance(50)
    const before = { ...frameOf(prediction, 0)! }

    // The server says the ball is 5 units away from where we drew it.
    prediction.adopt(input([ball(0, before.x + 5, before.y - 5, 200, 0)], { turnId: 1 }))
    const after = frameOf(prediction, 0)!
    expect(after.x).toBeCloseTo(before.x, 9)
    expect(after.y).toBeCloseTo(before.y, 9)
  })

  it('converges onto the authoritative position within about 150ms', () => {
    const prediction = createPrediction()
    prediction.adopt(input([ball(0, 100, 200)], { phase: 'aiming' }))
    prediction.advance(16)
    prediction.adopt(input([ball(0, 105, 195)], { phase: 'aiming', turnId: 2 }))
    for (let i = 0; i < 10; i++)
      prediction.advance(16)
    const frame = frameOf(prediction, 0)!
    expect(frame.x).toBeCloseTo(105, 3)
    expect(frame.y).toBeCloseTo(195, 3)
  })

  it('snaps a disagreement wider than the cap instead of gliding across the cloth', () => {
    const prediction = createPrediction()
    prediction.adopt(input([ball(0, 100, 200, 100, 0)]))
    prediction.advance(50)
    const before = { ...frameOf(prediction, 0)! }
    prediction.adopt(input([ball(0, before.x + 500, before.y, 100, 0)]))
    const after = frameOf(prediction, 0)!
    expect(Math.hypot(after.x - (before.x + 500), after.y - before.y)).toBeCloseTo(MAX_VISUAL_ERROR)
  })

  it('lands a deliberate teleport instantly — ball in hand is not a glide', () => {
    const prediction = createPrediction()
    prediction.adopt(input([ball(0, 100, 200)], { phase: 'aiming' }))
    prediction.advance(16)
    // Same phase but a jump: the cue ball was placed by hand.
    prediction.adopt(input([ball(0, 600, 320)], { phase: 'aiming', turnId: 2 }))
    const frame = frameOf(prediction, 0)!
    expect(frame.x).toBe(600)
    expect(frame.y).toBe(320)
  })

  it('snaps across a match change', () => {
    const prediction = createPrediction()
    prediction.adopt(input([ball(0, 100, 200, 300, 0)]))
    prediction.advance(50)
    prediction.adopt(input([ball(0, 200, 200)], { matchId: 2, phase: 'aiming' }))
    const frame = frameOf(prediction, 0)!
    expect(frame.x).toBe(200)
    expect(frame.y).toBe(200)
  })
})

describe('local simulation', () => {
  it('matches stepPhysics run directly for the same number of fixed steps', () => {
    const start = [ball(0, 100, 200, 400, 120), ball(1, 400, 260)]
    const prediction = createPrediction()
    prediction.adopt(input(start))

    const steps = 12
    prediction.advance(steps * FIXED_STEP * 1000)

    const reference = start.map(b => ({ ...b }))
    const report = emptyReport()
    for (let i = 0; i < steps; i++)
      stepPhysics(reference, report)

    for (const expected of reference) {
      if (expected.pocketed)
        continue
      const frame = frameOf(prediction, expected.id)!
      expect(frame.x).toBeCloseTo(expected.x, 9)
      expect(frame.y).toBeCloseTo(expected.y, 9)
    }
  })

  it('never moves balls when the phase is not moving', () => {
    const prediction = createPrediction()
    prediction.adopt(input([ball(0, 100, 200, 900, 900)], { phase: 'aiming' }))
    prediction.advance(500)
    const frame = frameOf(prediction, 0)!
    expect(frame.x).toBe(100)
    expect(frame.y).toBe(200)
    expect(prediction.moving()).toBe(false)
  })

  it('stops at the prediction budget when snapshots stop arriving', () => {
    const prediction = createPrediction()
    prediction.adopt(input([ball(0, 100, 200, 300, 0)]))
    // `advance` clamps each call to 100ms, so the budget is reached across several frames.
    for (let i = 0; i < 20; i++)
      prediction.advance(16)
    const atBudget = { ...frameOf(prediction, 0)! }
    for (let i = 0; i < 60; i++)
      prediction.advance(16)
    const later = frameOf(prediction, 0)!
    expect(later.x).toBeCloseTo(atBudget.x, 9)
    expect(later.y).toBeCloseTo(atBudget.y, 9)
    // It stopped because of the budget, not because the ball came to rest.
    expect(atBudget.x).toBeGreaterThan(100)
    expect(atBudget.x - 100).toBeLessThan(300 * (MAX_PREDICTION_MS / 1000) + 1)
  })
})

describe('pocketing', () => {
  it('sinks a ball the server reports as pocketed instead of vanishing mid-cloth', () => {
    const prediction = createPrediction()
    prediction.adopt(input([ball(0, 100, 200, 200, 0), ball(1, 60, 60)]))
    prediction.advance(16)
    expect(frameOf(prediction, 1)).toBeDefined()

    prediction.adopt(input([ball(0, 140, 200, 200, 0), ball(1, 60, 60, 0, 0, true)]))
    const sinking = frameOf(prediction, 1)
    expect(sinking).toBeDefined()
    expect(sinking!.scale).toBeLessThanOrEqual(1)

    for (let i = 0; i < 10; i++)
      prediction.advance(16)
    expect(frameOf(prediction, 1)).toBeUndefined()
  })

  it('shrinks the sinking ball towards its pocket', () => {
    const prediction = createPrediction()
    prediction.adopt(input([ball(1, 60, 60)]))
    prediction.advance(16)
    prediction.adopt(input([ball(1, 60, 60, 0, 0, true)]))
    prediction.advance(SINK_MS / 2)
    const frame = frameOf(prediction, 1)!
    expect(frame.scale).toBeGreaterThan(0)
    expect(frame.scale).toBeLessThan(1)
    // Drifting towards the top-left pocket at (0, 0).
    expect(frame.x).toBeLessThan(60)
    expect(frame.y).toBeLessThan(60)
  })

  it('restores a ball the server un-pockets, such as a respotted eight', () => {
    const prediction = createPrediction()
    prediction.adopt(input([ball(8, 60, 60, 0, 0, true)]))
    prediction.advance(16)
    prediction.adopt(input([ball(8, 595, 200)], { phase: 'aiming', matchId: 2 }))
    const frame = frameOf(prediction, 8)!
    expect(frame.x).toBe(595)
    expect(frame.y).toBe(200)
    expect(frame.scale).toBe(1)
  })
})
