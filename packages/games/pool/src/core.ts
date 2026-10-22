import type { Ball, ShotReport } from '@kangeikai/game-pool/physics'

export type Group = 'solids' | 'stripes'
export type Seat = 0 | 1
export type Phase = 'waiting' | 'aiming' | 'moving' | 'finished'

export function groupOf(id: number): Group | null {
  return id >= 1 && id <= 7 ? 'solids' : id >= 9 && id <= 15 ? 'stripes' : null
}

/** Index 0 is the cue, 1-7 the solids' hues, 8 the eight; stripes reuse their solid twin's hue. */
export const BALL_HUES = [0xFFFFFF, 0xF5CB42, 0x438BDC, 0xE94F51, 0xA16BD4, 0xF2943D, 0x38AB76, 0xAF384F, 0x141B22] as const
/** A striped ball's body is off-white, with the hue carried by the band alone. */
export const BALL_BODY_LIGHT = 0xF8F5E9
export const BALL_NUMBER_PATCH = 0xFFFDF4
export const BALL_NUMBER_INK = 0x17212B

export function toCssHex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

export function ballHue(id: number): number {
  return BALL_HUES[id > 8 ? id - 8 : id]
}

export function ballHueCss(id: number): string {
  return toCssHex(ballHue(id))
}

export function ballBodyHue(id: number): number {
  return id > 8 ? BALL_BODY_LIGHT : ballHue(id)
}

export function ballBodyCss(id: number): string {
  return toCssHex(ballBodyHue(id))
}

/**
 * Rule sets. Not to be confused with an "open table" (groups not assigned yet): these are the
 * variants players pick before a match.
 */
export const GAME_MODES = ['8-ball', 'regional'] as const
export type GameMode = typeof GAME_MODES[number]

export const GAME_MODE_INFO: Record<GameMode, { label: string, description: string }> = {
  '8-ball': {
    label: '8-ball',
    description: 'Standard rules. Your first contact must be one of your own balls. A wrong first contact or a scratch gives your opponent ball in hand. After contact, a ball must be pocketed or hit a rail.',
  },
  'regional': {
    label: 'Regional',
    description: 'Stricter house rules. If you hit an opponent\'s ball first, you lose your turn and their lowest-numbered ball is pocketed for them (no ball in hand). A scratch also pockets their lowest ball and gives ball in hand. Soft safety plays are allowed: no rail is required after contact.',
  },
}

export interface ShotContext {
  mode: GameMode
  shooter: Seat
  groups: [Group | null, Group | null]
  breaking: boolean
  /** Captured before the shot: potting the last group ball and eight together is not legal. */
  eligibleForEight: boolean
}

export interface ShotOutcome {
  groups: [Group | null, Group | null]
  next: Seat
  foul: string | null
  winner: Seat | null
  respotEight: boolean
  /** The opponent gets the cue ball in hand. False for a Regional wrong first contact, which only costs the turn. */
  ballInHand: boolean
  /** Regional penalty: the opponent's lowest remaining group ball is pocketed for them. */
  dropsOpponentBall: boolean
}

interface Foul { message: string, ballInHand: boolean, opponentContact?: boolean }

function ballInHandFoul(message: string): Foul {
  return { message, ballInHand: true }
}

function findFoul(context: ShotContext, report: ShotReport): Foul | null {
  const { shooter, groups, breaking, eligibleForEight, mode } = context
  const objectPotted = report.pocketed.some(id => id !== 0)
  let foul: Foul | null = null
  if (report.firstContact === null) {
    foul = ballInHandFoul('The cue ball did not hit any ball.')
  }
  else if (!breaking && (groups[shooter] === null ? report.firstContact === 8 : eligibleForEight ? report.firstContact !== 8 : groupOf(report.firstContact) !== groups[shooter])) {
    const opponentContact = groups[shooter] !== null && groupOf(report.firstContact) !== null
    foul = mode === 'regional' && opponentContact
      ? { message: 'The first ball hit was an opponent\'s ball.', ballInHand: false, opponentContact: true }
      : ballInHandFoul('The first ball hit was not a valid target.')
  }
  else if (breaking && !objectPotted && report.railsAfterContact.filter(id => id !== 0).length < 4) {
    foul = ballInHandFoul('Invalid break: pocket a ball or drive four balls to a rail.')
  }
  else if (mode === '8-ball' && !objectPotted && report.railsAfterContact.length === 0) {
    foul = ballInHandFoul('No ball was pocketed and none hit a rail after contact.')
  }
  if (report.pocketed.includes(0))
    foul = ballInHandFoul('The cue ball was pocketed.')
  return foul
}

/** The first group potted on an open table becomes the shooter's; the opponent gets the other. */
function assignGroups(context: ShotContext, report: ShotReport): ShotOutcome['groups'] {
  const { shooter } = context
  const opponent: Seat = shooter === 0 ? 1 : 0
  const groups: ShotOutcome['groups'] = [...context.groups]
  const first = report.pocketed.map(groupOf).find(group => group !== null)
  if (first && groups[shooter] === null) {
    groups[shooter] = first
    groups[opponent] = first === 'solids' ? 'stripes' : 'solids'
  }
  return groups
}

function keepsTurn(context: ShotContext, report: ShotReport, groups: ShotOutcome['groups']): boolean {
  const { shooter, breaking } = context
  const opponent: Seat = shooter === 0 ? 1 : 0
  // House rule: potting any opponent ball ends the turn, even alongside an own-group pot (not a foul). Uses the pre-shot groups so an open table still assigns on a mixed pot.
  const pottedOpponent = !breaking && report.pocketed.some(id => groupOf(id) !== null && groupOf(id) === context.groups[opponent])
  return !pottedOpponent && report.pocketed.some(id => breaking ? id !== 0 : groupOf(id) !== null && groupOf(id) === groups[shooter])
}

export function evaluateShot(context: ShotContext, report: ShotReport): ShotOutcome {
  const { shooter, breaking, eligibleForEight } = context
  const opponent: Seat = shooter === 0 ? 1 : 0
  const found = findFoul(context, report)
  const foul = found?.message ?? null
  let winner: Seat | null = null
  if (!breaking && report.pocketed.includes(8))
    winner = eligibleForEight && !foul ? shooter : opponent
  const groups = !breaking && !foul ? assignGroups(context, report) : [...context.groups] as ShotOutcome['groups']
  const retained = !foul && keepsTurn(context, report, groups)
  const dropsOpponentBall = context.mode === 'regional' && !breaking && context.groups[shooter] !== null && Boolean(found?.opponentContact || report.pocketed.includes(0))
  return { groups, next: retained ? shooter : opponent, foul, winner, respotEight: breaking && report.pocketed.includes(8), ballInHand: found?.ballInHand ?? false, dropsOpponentBall }
}

/** Lowest-numbered ball of `group` still on the table (the eight is never part of a group). */
export function lowestBall(balls: Ball[], group: Group | null): number | null {
  const ids = balls.filter(ball => !ball.pocketed && group !== null && groupOf(ball.id) === group).map(ball => ball.id)
  return ids.length > 0 ? Math.min(...ids) : null
}

export function hasClearedGroup(balls: Ball[], group: Group | null): boolean {
  return group !== null && !balls.some(ball => !ball.pocketed && groupOf(ball.id) === group)
}
