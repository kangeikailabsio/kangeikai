import type { ShotContext } from '@kangeikai/game-pool/core'
import { BALL_HUES, ballBodyCss, ballHue, ballHueCss, evaluateShot, hasClearedGroup, lowestBall, nextSeat, otherTeam, teamOfSeat, toCssHex } from '@kangeikai/game-pool/core'
import { createRack } from '@kangeikai/game-pool/physics'
import { describe, expect, it } from 'vitest'

describe('ball palette', () => {
  it('renders css hex with zero padding', () => {
    expect(toCssHex(0x141B22)).toBe('#141b22')
    expect(toCssHex(0)).toBe('#000000')
    expect(toCssHex(0xFFFFFF)).toBe('#ffffff')
  })

  it('gives a striped ball the same hue as its solid twin', () => {
    for (let id = 1; id <= 7; id++)
      expect(ballHueCss(id + 8)).toBe(ballHueCss(id))
  })

  it('keeps a striped body light and a solid body coloured', () => {
    expect(ballBodyCss(9)).toBe('#f8f5e9')
    expect(ballBodyCss(1)).toBe(ballHueCss(1))
    expect(ballHue(0)).toBe(0xFFFFFF)
    expect(BALL_HUES).toHaveLength(9)
  })
})

const open: ShotContext = { mode: '8-ball', shooter: 0, groups: [null, null], breaking: false, eligibleForEight: false }
const assigned: ShotContext = { ...open, groups: ['solids', 'stripes'] }

describe('casual eight-ball rules', () => {
  it('keeps the table open after a legal break', () => {
    expect(evaluateShot({ ...open, breaking: true }, { firstContact: 1, pocketed: [9], railsAfterContact: [] }))
      .toMatchObject({ groups: [null, null], next: 0, foul: null })
  })
  it('assigns mixed pots by first pocketed group after the break', () => {
    expect(evaluateShot(open, { firstContact: 1, pocketed: [9, 2], railsAfterContact: [] }))
      .toMatchObject({ groups: ['stripes', 'solids'], next: 0 })
  })
  it('does not assign groups on a scratch', () => {
    expect(evaluateShot(open, { firstContact: 1, pocketed: [1, 0], railsAfterContact: [] }))
      .toMatchObject({ groups: [null, null], next: 1 })
  })
  it.each([
    { firstContact: null, pocketed: [], railsAfterContact: [] },
    { firstContact: 9, pocketed: [1], railsAfterContact: [] },
    { firstContact: 1, pocketed: [], railsAfterContact: [] },
    { firstContact: 1, pocketed: [0], railsAfterContact: [1] },
  ])('gives the opponent ball in hand for %j', (report) => {
    const result = evaluateShot(assigned, report)
    expect(result.foul).not.toBeNull()
    expect(result.next).toBe(1)
  })
  it('passes the turn after a legal miss and retains it after a legal own-group pot', () => {
    expect(evaluateShot(assigned, { firstContact: 1, pocketed: [], railsAfterContact: [0] }).next).toBe(1)
    expect(evaluateShot(assigned, { firstContact: 1, pocketed: [2], railsAfterContact: [] }).next).toBe(0)
  })
  it.each([[2, 9], [9, 2]])('passes the turn, without a foul, when an own ball and an opponent ball drop together (%i then %i)', (first, second) => {
    expect(evaluateShot(assigned, { firstContact: 1, pocketed: [first, second], railsAfterContact: [] }))
      .toMatchObject({ next: 1, foul: null })
  })
  it('passes the turn when only an opponent ball drops', () => {
    expect(evaluateShot(assigned, { firstContact: 1, pocketed: [9], railsAfterContact: [] }))
      .toMatchObject({ next: 1, foul: null })
  })
  it('keeps the turn on a mixed pot on the break and on an open table', () => {
    expect(evaluateShot({ ...open, breaking: true }, { firstContact: 1, pocketed: [2, 9], railsAfterContact: [] }).next).toBe(0)
    expect(evaluateShot(open, { firstContact: 1, pocketed: [2, 9], railsAfterContact: [] }).next).toBe(0)
  })
  it('requires four distinct object balls at cushions on an unpotted break', () => {
    const context = { ...open, breaking: true }
    expect(evaluateShot(context, { firstContact: 1, pocketed: [], railsAfterContact: [1, 2, 3] }).foul).not.toBeNull()
    expect(evaluateShot(context, { firstContact: 1, pocketed: [], railsAfterContact: [1, 2, 3, 4] }).foul).toBeNull()
  })
  it('respots the eight on the break even with a scratch', () => {
    expect(evaluateShot({ ...open, breaking: true }, { firstContact: 1, pocketed: [8, 0], railsAfterContact: [] }))
      .toMatchObject({ respotEight: true, winner: null, next: 1 })
  })
  it('awards the eight only when the group was already cleared and no foul occurred', () => {
    const report = { firstContact: 8, pocketed: [8], railsAfterContact: [] }
    expect(evaluateShot({ ...assigned, eligibleForEight: true }, report).winner).toBe(0)
    expect(evaluateShot(assigned, report).winner).toBe(1)
    expect(evaluateShot({ ...assigned, eligibleForEight: true }, { ...report, pocketed: [8, 0] }).winner).toBe(1)
    expect(evaluateShot(assigned, { firstContact: 7, pocketed: [7, 8], railsAfterContact: [] }).winner).toBe(1)
  })
  it('does not consider an open table eligible for the eight', () => {
    const balls = createRack()
    expect(hasClearedGroup(balls, null)).toBe(false)
    balls.forEach((b) => {
      if (b.id >= 1 && b.id <= 7)
        b.pocketed = true
    })
    expect(hasClearedGroup(balls, 'solids')).toBe(true)
    expect(hasClearedGroup(balls, 'stripes')).toBe(false)
  })
})

describe('regional mode', () => {
  const regional: ShotContext = { ...assigned, mode: 'regional' }
  const wrongContact = { firstContact: 9, pocketed: [], railsAfterContact: [9] }

  it('costs a wrong first contact only the turn and pockets the opponent ball, unlike 8-ball', () => {
    expect(evaluateShot(regional, wrongContact)).toMatchObject({ next: 1, ballInHand: false, dropsOpponentBall: true })
    expect(evaluateShot(regional, wrongContact).foul).not.toBeNull()
    expect(evaluateShot(assigned, wrongContact)).toMatchObject({ next: 1, ballInHand: true, dropsOpponentBall: false })
  })
  it('still passes the turn when the shooter also pots an own ball after a wrong first contact', () => {
    expect(evaluateShot(regional, { firstContact: 9, pocketed: [1], railsAfterContact: [9] })).toMatchObject({ next: 1, dropsOpponentBall: true })
  })
  it('treats a scratch as the same penalty with the cue ball returning to the start, never ball in hand', () => {
    const scratch = { firstContact: 1, pocketed: [0], railsAfterContact: [1] }
    expect(evaluateShot(regional, scratch)).toMatchObject({ next: 1, ballInHand: false, respotCue: true, dropsOpponentBall: true })
    expect(evaluateShot(assigned, scratch)).toMatchObject({ ballInHand: true, respotCue: false, dropsOpponentBall: false })
  })
  it('pockets only one ball when a scratch comes with a wrong or missing first contact', () => {
    for (const firstContact of [9, null])
      expect(evaluateShot(regional, { firstContact, pocketed: [0], railsAfterContact: [] })).toMatchObject({ next: 1, ballInHand: false, respotCue: true, dropsOpponentBall: true })
  })
  it('applies the penalty when the cue ball touches nothing', () => {
    expect(evaluateShot(regional, { firstContact: null, pocketed: [], railsAfterContact: [] })).toMatchObject({ next: 1, ballInHand: false, respotCue: false, dropsOpponentBall: true })
    expect(evaluateShot(assigned, { firstContact: null, pocketed: [], railsAfterContact: [] })).toMatchObject({ ballInHand: true, dropsOpponentBall: false })
  })
  it('also pockets the opponent\'s lowest ball when an opponent ball is pocketed, even after a legal first contact', () => {
    const potted = { firstContact: 1, pocketed: [9], railsAfterContact: [] }
    expect(evaluateShot(regional, potted)).toMatchObject({ next: 1, foul: null, ballInHand: false, respotCue: false, dropsOpponentBall: true })
    expect(evaluateShot(assigned, potted)).toMatchObject({ next: 1, dropsOpponentBall: false })
    expect(evaluateShot(regional, { firstContact: 1, pocketed: [2, 9], railsAfterContact: [] })).toMatchObject({ next: 1, dropsOpponentBall: true })
  })
  it('stays a single penalty ball when several causes combine', () => {
    expect(evaluateShot(regional, { firstContact: 9, pocketed: [0, 9, 10], railsAfterContact: [] })).toMatchObject({ next: 1, dropsOpponentBall: true, respotCue: true })
  })
  it('does not penalize a mixed pot on an open table or on the break', () => {
    expect(evaluateShot({ ...open, mode: 'regional' }, { firstContact: 1, pocketed: [2, 9], railsAfterContact: [] })).toMatchObject({ next: 0, dropsOpponentBall: false })
    expect(evaluateShot({ ...regional, breaking: true }, { firstContact: 1, pocketed: [2, 9], railsAfterContact: [] })).toMatchObject({ dropsOpponentBall: false })
  })
  it('keeps the turn only when the first contact is legal and an own ball drops', () => {
    expect(evaluateShot(regional, { firstContact: 1, pocketed: [2], railsAfterContact: [] })).toMatchObject({ next: 0, foul: null, dropsOpponentBall: false })
    expect(evaluateShot(regional, { firstContact: 1, pocketed: [], railsAfterContact: [] })).toMatchObject({ next: 1, foul: null, dropsOpponentBall: false })
  })
  it('has no ball to drop on an open table or on the break, but a scratch still returns the cue ball', () => {
    const scratch = { firstContact: 9, pocketed: [0], railsAfterContact: [9] }
    expect(evaluateShot({ ...open, mode: 'regional' }, scratch)).toMatchObject({ dropsOpponentBall: false, respotCue: true, ballInHand: false })
    expect(evaluateShot({ ...regional, breaking: true }, { firstContact: 1, pocketed: [0], railsAfterContact: [] })).toMatchObject({ dropsOpponentBall: false, respotCue: true })
  })
  it('keeps the ordinary ball-in-hand foul for a first contact on the eight on an open table', () => {
    expect(evaluateShot({ ...open, mode: 'regional' }, { firstContact: 8, pocketed: [], railsAfterContact: [8] })).toMatchObject({ ballInHand: true, dropsOpponentBall: false })
  })
  it('applies the same penalty when the shooter is on the eight and hits an opponent ball', () => {
    expect(evaluateShot({ ...regional, eligibleForEight: true }, wrongContact)).toMatchObject({ next: 1, ballInHand: false, dropsOpponentBall: true })
  })
  it('penalizes hitting the eight first while the shooter still has group balls', () => {
    expect(evaluateShot(regional, { firstContact: 8, pocketed: [], railsAfterContact: [8] })).toMatchObject({ next: 1, ballInHand: false, dropsOpponentBall: true })
  })
  it('does not require a rail after contact, but 8-ball does', () => {
    const soft = { firstContact: 1, pocketed: [], railsAfterContact: [] }
    expect(evaluateShot(regional, soft)).toMatchObject({ foul: null, next: 1, ballInHand: false })
    expect(evaluateShot(assigned, soft).foul).not.toBeNull()
  })
  it('keeps the break rule in both modes', () => {
    const weak = { firstContact: 1, pocketed: [], railsAfterContact: [1, 2] }
    expect(evaluateShot({ ...regional, groups: [null, null], breaking: true }, weak).foul).not.toBeNull()
  })
  it('loses the match when the eight drops after a wrong first contact', () => {
    expect(evaluateShot({ ...regional, eligibleForEight: true }, { firstContact: 9, pocketed: [8], railsAfterContact: [9] }).winner).toBe(1)
  })
})

describe('lowestBall', () => {
  const ball = (id: number, pocketed = false) => ({ id, x: 0, y: 0, vx: 0, vy: 0, pocketed })
  it('picks the lowest remaining ball of the group and ignores the eight', () => {
    const balls = [ball(0), ball(9, true), ball(11), ball(10), ball(8), ball(3)]
    expect(lowestBall(balls, 'stripes')).toBe(10)
    expect(lowestBall(balls, 'solids')).toBe(3)
  })
  it('is null when only the eight, or nothing, is left', () => {
    expect(lowestBall([ball(8), ball(1, true)], 'solids')).toBeNull()
    expect(lowestBall([ball(8)], null)).toBeNull()
  })
})

describe('teams and rotation', () => {
  it('maps each seat to a team, one seat per team in 1v1 and half and half with four seats', () => {
    expect([0, 1].map(seat => teamOfSeat(seat, 2))).toEqual([0, 1])
    expect([0, 1, 2, 3].map(seat => teamOfSeat(seat, 4))).toEqual([0, 0, 1, 1])
  })
  it('flips the team', () => {
    expect(otherTeam(0)).toBe(1)
    expect(otherTeam(1)).toBe(0)
  })
  it('moves to the next seat in the rotation and wraps around', () => {
    expect(nextSeat([0, 1], 0)).toBe(1)
    expect(nextSeat([0, 1], 1)).toBe(0)
    expect(nextSeat([0, 2, 1, 3], 2)).toBe(1)
    expect(nextSeat([0, 2, 1, 3], 3)).toBe(0)
  })
})
