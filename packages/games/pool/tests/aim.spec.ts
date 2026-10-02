import type { Ball } from '@kangeikai/game-pool/physics'
import { aimAngle, aimDistance, chargeFromDrag, MAX_POWER, MAX_PULL, MIN_POWER, MIN_PULL, pullDistance } from '@kangeikai/game-pool/aim'
import { BALL_RADIUS, TABLE_WIDTH } from '@kangeikai/game-pool/physics'
import { describe, expect, it } from 'vitest'

function ball(id: number, x: number, y: number): Ball {
  return { id, x, y, vx: 0, vy: 0, pocketed: false }
}

/** Walks `distance` back along the aim axis from `anchor` — the gesture that charges a shot. */
function pullBack(anchor: { x: number, y: number }, angle: number, distance: number): { x: number, y: number } {
  return { x: anchor.x - Math.cos(angle) * distance, y: anchor.y - Math.sin(angle) * distance }
}

const ANGLES = [0, Math.PI / 6, Math.PI / 4, Math.PI / 2, 2.3, Math.PI, -Math.PI / 3, -1.9]

describe('aim angle', () => {
  it('points from the cue ball towards the target within atan2 range', () => {
    expect(aimAngle({ x: 100, y: 100 }, { x: 200, y: 100 })).toBeCloseTo(0)
    expect(aimAngle({ x: 100, y: 100 }, { x: 100, y: 200 })).toBeCloseTo(Math.PI / 2)
    expect(aimAngle({ x: 100, y: 100 }, { x: 0, y: 100 })).toBeCloseTo(Math.PI)
    for (const angle of ANGLES) {
      const result = aimAngle({ x: 400, y: 200 }, pullBack({ x: 400, y: 200 }, angle, -50))
      expect(result).toBeGreaterThanOrEqual(-Math.PI)
      expect(result).toBeLessThanOrEqual(Math.PI)
      expect(result).toBeCloseTo(Math.atan2(Math.sin(angle), Math.cos(angle)))
    }
  })
})

describe('cue pull distance', () => {
  it('is signed: positive pulling back, negative pushing forward', () => {
    const anchor = { x: 300, y: 200 }
    for (const angle of ANGLES) {
      expect(pullDistance(anchor, pullBack(anchor, angle, 60), angle)).toBeCloseTo(60)
      expect(pullDistance(anchor, pullBack(anchor, angle, -60), angle)).toBeCloseTo(-60)
    }
  })

  it('reports a stationary press as below the dead zone', () => {
    const anchor = { x: 120, y: 340 }
    expect(pullDistance(anchor, { ...anchor }, 1.1)).toBeCloseTo(0)
    expect(pullDistance(anchor, { ...anchor }, 1.1)).toBeLessThan(MIN_PULL)
  })

  it('ignores movement perpendicular to the aim axis', () => {
    for (const angle of ANGLES) {
      const anchor = { x: 250, y: 250 }
      const sideways = { x: anchor.x - Math.sin(angle) * 90, y: anchor.y + Math.cos(angle) * 90 }
      expect(pullDistance(anchor, sideways, angle)).toBeCloseTo(0)
    }
  })
})

describe('charge from drag', () => {
  it('maps the pull linearly and saturates at both ends', () => {
    const anchor = { x: 400, y: 200 }
    const angle = 0.8
    expect(chargeFromDrag(anchor, pullBack(anchor, angle, MAX_PULL), angle)).toBeCloseTo(MAX_POWER)
    expect(chargeFromDrag(anchor, pullBack(anchor, angle, MAX_PULL / 2), angle)).toBeCloseTo(0.5)
    expect(chargeFromDrag(anchor, pullBack(anchor, angle, MAX_PULL * 2), angle)).toBe(MAX_POWER)
    expect(chargeFromDrag(anchor, pullBack(anchor, angle, MAX_PULL / 4), angle)).toBeCloseTo(0.25)
  })

  it('charges nothing when the drag is perpendicular to the aim', () => {
    for (const angle of ANGLES) {
      const anchor = { x: 250, y: 250 }
      const sideways = { x: anchor.x - Math.sin(angle) * 200, y: anchor.y + Math.cos(angle) * 200 }
      expect(chargeFromDrag(anchor, sideways, angle)).toBe(MIN_POWER)
    }
  })

  it('never returns a negative power when the cue is pushed forward', () => {
    const anchor = { x: 300, y: 150 }
    for (const angle of ANGLES) {
      for (const distance of [1, 40, MAX_PULL, MAX_PULL * 3]) {
        expect(chargeFromDrag(anchor, pullBack(anchor, angle, -distance), angle)).toBe(MIN_POWER)
      }
    }
  })

  it('stays inside the wire schema bounds for any angle and drag vector', () => {
    for (const angle of ANGLES) {
      for (let dx = -900; dx <= 900; dx += 150) {
        for (let dy = -900; dy <= 900; dy += 150) {
          const power = chargeFromDrag({ x: 0, y: 0 }, { x: dx, y: dy }, angle)
          expect(power).toBeGreaterThanOrEqual(MIN_POWER)
          expect(power).toBeLessThanOrEqual(MAX_POWER)
          expect(Number.isFinite(power)).toBe(true)
        }
      }
    }
  })

  it('is rotation invariant — rotating anchor, drag and aim together changes nothing', () => {
    const anchor = { x: 120, y: 90 }
    const point = { x: 30, y: 210 }
    const angle = 0.42
    const reference = chargeFromDrag(anchor, point, angle)
    for (const theta of ANGLES) {
      const rotate = (p: { x: number, y: number }) => ({
        x: p.x * Math.cos(theta) - p.y * Math.sin(theta),
        y: p.x * Math.sin(theta) + p.y * Math.cos(theta),
      })
      expect(chargeFromDrag(rotate(anchor), rotate(point), angle + theta)).toBeCloseTo(reference)
    }
  })
})

describe('first-contact guide distance', () => {
  it('runs to the far rail on an empty table', () => {
    expect(aimDistance([ball(0, 100, 200)], 100, 200, 0)).toBeCloseTo(TABLE_WIDTH - BALL_RADIUS - 100)
  })

  it('stops at the contact point of a ball straight ahead', () => {
    expect(aimDistance([ball(0, 100, 200), ball(1, 300, 200)], 100, 200, 0)).toBeCloseTo(200 - 2 * BALL_RADIUS)
  })

  it('ignores the cue ball itself, pocketed balls and balls behind the aim', () => {
    const behind = [ball(0, 400, 200), ball(1, 100, 200)]
    expect(aimDistance(behind, 400, 200, 0)).toBeCloseTo(TABLE_WIDTH - BALL_RADIUS - 400)
    const pocketed = [ball(0, 100, 200), { ...ball(1, 300, 200), pocketed: true }]
    expect(aimDistance(pocketed, 100, 200, 0)).toBeCloseTo(TABLE_WIDTH - BALL_RADIUS - 100)
  })

  it('never returns a negative distance for a ball already in contact', () => {
    expect(aimDistance([ball(0, 100, 200), ball(1, 115, 200)], 100, 200, 0)).toBeGreaterThanOrEqual(0)
  })
})
