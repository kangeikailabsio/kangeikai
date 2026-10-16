import type { Ball } from '@kangeikai/game-pool/physics'
import { BALL_RADIUS, canPlaceBall, createRack, emptyReport, MAX_SHOT_SPEED, respotEight, stepPhysics } from '@kangeikai/game-pool/physics'
import { describe, expect, it } from 'vitest'

function ball(id: number, x: number, y: number, vx = 0, vy = 0): Ball {
  return { id, x, y, vx, vy, pocketed: false }
}

describe('continuous pool physics', () => {
  it('racks sixteen distinct non-overlapping balls with the eight in the center', () => {
    const balls = createRack()
    expect(new Set(balls.map(b => b.id)).size).toBe(16)
    expect(balls.find(b => b.id === 8)).toMatchObject({ x: 595, y: 200 })
    for (const a of balls) {
      for (const b of balls) {
        if (a !== b)
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2 * BALL_RADIUS)
      }
    }
  })

  it('detects a high-speed impact between frame endpoints without tunnelling', () => {
    const balls = [ball(0, 100, 200, MAX_SHOT_SPEED), ball(1, 125, 200)]
    const report = emptyReport()
    stepPhysics(balls, report, 0.05)
    expect(report.firstContact).toBe(1)
    expect(balls[0].x).toBeLessThan(balls[1].x)
    expect(balls[1].vx).toBeGreaterThan(1000)
  })

  it('transfers both axes in an oblique collision without adding energy', () => {
    const balls = [ball(0, 100, 200, 1000), ball(1, 125, 211)]
    stepPhysics(balls, emptyReport(), 0.025)
    expect(balls[1].vy).toBeGreaterThan(0)
    expect(balls[0].vy).toBeLessThan(0)
    expect(balls.reduce((sum, b) => sum + b.vx ** 2 + b.vy ** 2, 0)).toBeLessThan(1_000_000)
  })

  it('rebounds from cushions and records rails only after first contact', () => {
    const balls = [ball(0, 780, 200, 1600)]
    const report = emptyReport()
    stepPhysics(balls, report)
    expect(balls[0].vx).toBeLessThan(0)
    expect(balls[0].x).toBeLessThanOrEqual(790)
    expect(report.railsAfterContact).toEqual([])
    report.firstContact = 1
    balls[0].x = 11
    balls[0].vx = -1000
    stepPhysics(balls, report)
    expect(report.railsAfterContact).toEqual([0])
  })

  it.each([[400, 50, 0, -1600], [750, 350, 1600, 1600]])('captures swept pocket entry at (%s,%s)', (x, y, vx, vy) => {
    const balls = [ball(0, x, y, vx, vy)]
    const report = emptyReport()
    stepPhysics(balls, report, 0.1)
    expect(balls[0].pocketed).toBe(true)
    expect(report.pocketed).toEqual([0])
    expect(balls[0].vx).toBe(0)
  })

  it('brings a full-power break to rest with finite positions and no overlaps', () => {
    const balls = createRack()
    const report = emptyReport()
    balls[0].vx = MAX_SHOT_SPEED
    let moving = true
    let steps = 0
    while (moving && steps++ < 2400)
      moving = stepPhysics(balls, report)
    expect(moving).toBe(false)
    expect(report.firstContact).toBe(1)
    for (const a of balls.filter(b => !b.pocketed)) {
      expect(Number.isFinite(a.x + a.y)).toBe(true)
      expect(a.x).toBeGreaterThanOrEqual(9.999)
      expect(a.x).toBeLessThanOrEqual(790.001)
      for (const b of balls.filter(b => b !== a && !b.pocketed))
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(19.999)
    }
  })

  it('rejects placement outside the cloth, in pockets, overlapping, or non-finite', () => {
    const balls = createRack()
    expect(canPlaceBall(balls, 0, 300, 200)).toBe(true)
    for (const [x, y] of [[-1, 20], [400, 10], [560, 200], [Number.NaN, 200], [200, Infinity]])
      expect(canPlaceBall(balls, 0, x, y)).toBe(false)
  })

  it('respots the eight at the first free point toward the foot cushion', () => {
    const balls = [ball(8, 0, 0), ball(1, 595, 200)]
    balls[0].pocketed = true
    respotEight(balls)
    expect(balls[0].pocketed).toBe(false)
    expect(balls[0].x).toBeGreaterThan(615)
    expect(balls[0].y).toBe(200)
  })
})
