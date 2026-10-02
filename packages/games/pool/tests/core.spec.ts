import type { ShotContext } from '@kangeikai/game-pool/core'
import { BALL_HUES, ballBodyCss, ballHue, ballHueCss, evaluateShot, hasClearedGroup, toCssHex } from '@kangeikai/game-pool/core'
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

const open: ShotContext = { shooter: 0, groups: [null, null], breaking: false, eligibleForEight: false }
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
