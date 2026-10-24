import type { Ball } from '@kangeikai/game-pool/physics'
import { AIM_SEND_INTERVAL_MS, aimAngle, aimChanged, aimDistance, aimGuide, chargeFromDrag, MAX_POWER, MAX_PULL, MIN_POWER, MIN_PULL, pullDistance, shouldSendAim, smoothAngle, smoothingFactor, wrapAngle } from '@kangeikai/game-pool/aim'
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

describe('aim guide geometry', () => {
  const cue = { x: 100, y: 100 }
  it('lays dashes of 6 units every 14, starting 15 units out and stopping at the contact point', () => {
    const guide = aimGuide(cue, 0, 60, 0.5)
    expect(guide.dashes[0]).toEqual([{ x: 115, y: 100 }, { x: 121, y: 100 }])
    expect(guide.dashes[1][0].x).toBeCloseTo(129)
    expect(guide.dashes.at(-1)![1].x).toBeLessThanOrEqual(160)
    expect(guide.contact).toEqual({ x: 160, y: 100 })
  })
  it('has no dashes when the first contact is closer than the first dash', () => {
    expect(aimGuide(cue, 0, 10, 0.5).dashes).toEqual([])
  })
  it('draws the cue behind the cue ball, pulled back further with more power', () => {
    const soft = aimGuide(cue, 0, 100, 0)
    const hard = aimGuide(cue, 0, 100, 1)
    expect(soft.cue[0].x).toBeCloseTo(100 - 18)
    expect(hard.cue[0].x).toBeCloseTo(100 - 73)
    expect(hard.cue[1].x).toBeCloseTo(100 - 73 - 90)
    expect(hard.tip[1].x).toBeCloseTo(100 - 73 - 7)
  })
  it('brings the cue to the ball as the strike progresses', () => {
    expect(aimGuide(cue, 0, 100, 1, 0).cue[0]).toEqual({ x: 100, y: 100 })
  })
  it('follows the angle', () => {
    const guide = aimGuide(cue, Math.PI / 2, 60, 0.5)
    expect(guide.contact.x).toBeCloseTo(100)
    expect(guide.contact.y).toBeCloseTo(160)
  })
})

describe('sharing the aim', () => {
  const base = { angle: 1, power: 0.5, locked: false }
  it('sends the first aim and then only visible changes', () => {
    expect(aimChanged(null, base)).toBe(true)
    expect(aimChanged(base, { ...base, angle: 1.0005 })).toBe(false)
    expect(aimChanged(base, { ...base, angle: 1.01 })).toBe(true)
    expect(aimChanged(base, { ...base, power: 0.502 })).toBe(false)
    expect(aimChanged(base, { ...base, power: 0.51 })).toBe(true)
    expect(aimChanged(base, { ...base, locked: true })).toBe(true)
  })
  it('treats angles either side of the wrap as close', () => {
    expect(aimChanged({ ...base, angle: Math.PI - 0.0005 }, { ...base, angle: -Math.PI + 0.0005 })).toBe(false)
  })
  it('tracks the placement preview and its start and end', () => {
    const placing = { ...base, placing: { x: 100, y: 100 } }
    expect(aimChanged(base, placing)).toBe(true)
    expect(aimChanged(placing, { ...placing, placing: { x: 100.2, y: 100 } })).toBe(false)
    expect(aimChanged(placing, { ...placing, placing: { x: 105, y: 100 } })).toBe(true)
    expect(aimChanged(placing, base)).toBe(true)
  })
  it('throttles to the send interval', () => {
    expect(shouldSendAim(null, base, 1000, 1000 - AIM_SEND_INTERVAL_MS + 1)).toBe(false)
    expect(shouldSendAim(null, base, 1000, 1000 - AIM_SEND_INTERVAL_MS)).toBe(true)
    expect(shouldSendAim(base, base, 5000, 0)).toBe(false)
  })
  it('wraps angles and smooths the short way round', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI)
    expect(smoothAngle(0, 1, 0.5)).toBeCloseTo(0.5)
    expect(smoothAngle(Math.PI - 0.1, -Math.PI + 0.1, 0.5)).toBeCloseTo(Math.PI, 1)
    expect(smoothAngle(0.3, 1, 1)).toBeCloseTo(1)
  })
  it('smooths faster over longer frames and never overshoots', () => {
    expect(smoothingFactor(0)).toBe(0)
    expect(smoothingFactor(16)).toBeLessThan(smoothingFactor(100))
    expect(smoothingFactor(100000)).toBeLessThanOrEqual(1)
  })
})
