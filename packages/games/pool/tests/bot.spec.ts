import type { GameMode } from '@kangeikai/game-pool/core'
import type { Ball } from '@kangeikai/game-pool/physics'
import { BotBrain, chooseCuePosition, generateCandidates, legalTargets, planShot, scoreShot, simulateShot } from '@kangeikai/game-pool/bot'
import { groupOf } from '@kangeikai/game-pool/core'
import { canPlaceBall, createRack } from '@kangeikai/game-pool/physics'
import { describe, expect, it } from 'vitest'

/** angle noise is exactly zero (cos(pi/2) = 0) and power noise is -4%, never a second-best pick. */
const steady = () => 0.25

function ball(id: number, x: number, y: number, pocketed = false): Ball {
  return { id, x, y, vx: 0, vy: 0, pocketed }
}
function view(balls: Ball[], groups: ['solids' | 'stripes' | null, 'solids' | 'stripes' | null] = [null, null], breaking = false, mode: GameMode = '8-ball') {
  return { mode, team: 1 as const, groups, breaking, balls }
}

describe('bot target selection', () => {
  it('may hit any group ball but never the eight on an open table', () => {
    const targets = legalTargets(view(createRack()))
    expect(targets).not.toContain(8)
    expect(targets).not.toContain(0)
    expect(targets).toHaveLength(14)
  })
  it('sticks to its own group, then the eight once the group is cleared', () => {
    const balls = [ball(0, 100, 100), ball(1, 300, 100), ball(2, 300, 200, true), ball(8, 500, 200), ball(9, 600, 300)]
    expect(legalTargets(view(balls, [null, 'solids']))).toEqual([1])
    balls[1].pocketed = true
    expect(legalTargets(view(balls, [null, 'solids']))).toEqual([8])
  })
})

describe('bot shot planning', () => {
  it('pots a plainly makeable ball', () => {
    const balls = [ball(0, 200, 140), ball(1, 340, 50), ball(9, 700, 350), ball(8, 700, 100)]
    const shot = planShot(view(balls), steady)
    expect(simulateShot(balls, shot.angle, shot.power).report.pocketed).toContain(1)
  })
  it('does not aim through another ball', () => {
    const balls = [ball(0, 100, 200), ball(9, 200, 200), ball(1, 600, 200)]
    const candidates = generateCandidates(balls, balls[0], [1])
    for (const candidate of candidates.filter(c => c.difficulty < 99))
      expect(simulateShot(balls, candidate.angle, 0.01).report.firstContact === 9).toBe(false)
  })
  it('hits its own group first even when an opponent ball is nearer', () => {
    const balls = [ball(0, 100, 200), ball(9, 200, 200), ball(1, 400, 320), ball(8, 700, 100)]
    const shot = planShot(view(balls, ['stripes', 'solids']), steady)
    const { report } = simulateShot(balls, shot.angle, shot.power)
    expect(groupOf(report.firstContact!)).toBe('solids')
  })
  it('goes for the eight once its group is cleared', () => {
    const balls = [ball(0, 150, 200), ball(1, 300, 100, true), ball(8, 450, 120), ball(9, 650, 350)]
    const shot = planShot(view(balls, ['stripes', 'solids']), steady)
    expect(simulateShot(balls, shot.angle, shot.power).report.firstContact).toBe(8)
  })
  it('keeps the angle within the protocol range and the power within limits', () => {
    const shot = planShot(view(createRack()), () => 0.5)
    expect(Math.abs(shot.angle)).toBeLessThanOrEqual(Math.PI)
    expect(shot.power).toBeGreaterThanOrEqual(0.01)
    expect(shot.power).toBeLessThanOrEqual(1)
  })
})

describe('bot scoring', () => {
  const balls = [ball(0, 100, 100), ball(1, 300, 100), ball(9, 600, 300)]
  const groups: ['solids' | 'stripes' | null, 'solids' | 'stripes' | null] = ['stripes', 'solids']
  it('scores a Regional wrong first contact below a legal miss', () => {
    const legalMiss = scoreShot(view(balls, groups, false, 'regional'), { firstContact: 1, pocketed: [], railsAfterContact: [1] })
    const wrongContact = scoreShot(view(balls, groups, false, 'regional'), { firstContact: 9, pocketed: [], railsAfterContact: [9] })
    expect(wrongContact).toBeLessThan(legalMiss)
  })
  it('does not punish a soft shot without a rail in Regional, unlike 8-ball', () => {
    const soft = { firstContact: 1, pocketed: [], railsAfterContact: [] }
    expect(scoreShot(view(balls, groups, false, 'regional'), soft)).toBeGreaterThan(scoreShot(view(balls, groups, false, '8-ball'), soft))
  })
})

describe('bot ball in hand', () => {
  it('chooses a legal position', () => {
    const balls = createRack()
    const spot = chooseCuePosition(view(balls))
    expect(canPlaceBall(balls, 0, spot.x, spot.y)).toBe(true)
  })
})

describe('bot pacing', () => {
  const turn = (balls: Ball[], extra = {}) => ({ ...view(balls), matchId: 1, turnId: 1, ballInHand: false, cuePlaced: true, ...extra })
  it('thinks first, plans over several updates, then shoots exactly once', () => {
    const brain = new BotBrain(steady, 100)
    const balls = [ball(0, 200, 140), ball(1, 340, 50), ball(9, 700, 350), ball(8, 700, 100)]
    const early = Array.from({ length: 20 }, () => brain.update(turn(balls), 0))
    expect(early.every(action => action === null)).toBe(true)
    expect(brain.update(turn(balls), 99)).toBeNull()
    expect(brain.update(turn(balls), 100)).toMatchObject({ kind: 'shoot' })
    expect(brain.update(turn(balls), 200)).toBeNull()
  })
  it('places the cue ball first when it has ball in hand, then shoots', () => {
    const brain = new BotBrain(steady, 100)
    const balls = [ball(0, 0, 0, true), ball(1, 340, 50), ball(9, 700, 350), ball(8, 700, 100)]
    expect(brain.update(turn(balls, { ballInHand: true, cuePlaced: false }), 0)).toBeNull()
    const place = brain.update(turn(balls, { ballInHand: true, cuePlaced: false }), 100)
    expect(place).toMatchObject({ kind: 'place' })
    Object.assign(balls[0], { x: 200, y: 140, pocketed: false })
    const placed = { ballInHand: true, cuePlaced: true }
    for (let i = 0; i < 20; i++)
      expect(brain.update(turn(balls, placed), 100)).toBeNull()
    expect(brain.update(turn(balls, placed), 200)).toMatchObject({ kind: 'shoot' })
  })
  it('starts over on a new turn', () => {
    const brain = new BotBrain(steady, 100)
    const balls = [ball(0, 200, 140), ball(1, 340, 50)]
    for (let i = 0; i < 20; i++) brain.update(turn(balls), 0)
    expect(brain.update(turn(balls), 100)).toMatchObject({ kind: 'shoot' })
    expect(brain.update(turn(balls, { turnId: 2 }), 150)).toBeNull()
  })
})
