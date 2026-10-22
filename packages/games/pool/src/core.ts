import type { Ball, ShotReport } from '@kangeikai/game-pool/physics'

export type Group = 'solids' | 'stripes'
/** One of the two sides. In 1v1 a team is a single player. */
export type Team = 0 | 1
/** Index of a place at the table. */
export type Seat = number

export function otherTeam(team: Team): Team {
  return team === 0 ? 1 : 0
}

/** The first half of the seats is Team A (0) and the second half Team B (1). */
export function teamOfSeat(seat: Seat, seatCount: number): Team {
  return seat < seatCount / 2 ? 0 : 1
}

/** The seat that shoots after `seat` in the rotation. */
export function nextSeat(order: readonly Seat[], seat: Seat): Seat {
  return order[(order.indexOf(seat) + 1) % order.length]
}
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

/** 1v1 has two seats; 2v2 has four, two per team (seats 0-1 are Team A, 2-3 Team B). */
export const GAME_FORMATS = ['1v1', '2v2'] as const
export type GameFormat = typeof GAME_FORMATS[number]

export const GAME_FORMAT_LABEL: Record<GameFormat, string> = { '1v1': '1 vs 1', '2v2': '2 vs 2' }

export function seatCountOf(format: GameFormat): number {
  return format === '2v2' ? 4 : 2
}

/** The seats that belong to a team, in seat order. */
export function seatsOfTeam(team: Team, seatCount: number): Seat[] {
  return Array.from({ length: seatCount }, (_, seat) => seat).filter(seat => teamOfSeat(seat, seatCount) === team)
}

export const GAME_MODE_INFO: Record<GameMode, { label: string, description: string }> = {
  '8-ball': {
    label: '8-ball',
    description: 'Standard rules. Your first contact must be one of your own balls. A wrong first contact or a scratch gives your opponent ball in hand. After contact, a ball must be pocketed or hit a rail.',
  },
  'regional': {
    label: 'Regional',
    description: 'Stricter house rules. Your first contact must be one of your own balls. If you hit an opponent\'s ball first, hit nothing, pocket the cue ball, or pocket an opponent\'s ball, you lose your turn and your opponent\'s lowest-numbered remaining ball is pocketed for them (one extra ball per shot). After a scratch the cue ball returns to the starting spot; otherwise it stays where it stopped. There is no ball in hand. Soft safety plays are allowed: no rail is required after contact.',
  },
}

export interface ShotContext {
  mode: GameMode
  shooter: Team
  groups: [Group | null, Group | null]
  breaking: boolean
  /** Captured before the shot: potting the last group ball and eight together is not legal. */
  eligibleForEight: boolean
}

export interface ShotOutcome {
  groups: [Group | null, Group | null]
  next: Team
  foul: string | null
  winner: Team | null
  respotEight: boolean
  /** The opponent gets the cue ball in hand. Never in Regional, where a wrong first contact only costs the turn. */
  ballInHand: boolean
  /** Regional scratch: the cue ball goes back to the starting spot instead of ball in hand. */
  respotCue: boolean
  /** Regional penalty: the opponent's lowest remaining group ball is pocketed for them. */
  dropsOpponentBall: boolean
}

/** `penalized`: the Regional penalty for a first contact that was not one of the shooter's own balls. */
interface Foul { message: string, ballInHand: boolean, penalized?: boolean }

function ballInHandFoul(message: string): Foul {
  return { message, ballInHand: true }
}

function findFoul(context: ShotContext, report: ShotReport): Foul | null {
  const { shooter, groups, breaking, eligibleForEight, mode } = context
  const regional = mode === 'regional'
  const objectPotted = report.pocketed.some(id => id !== 0)
  // Regional only penalizes once groups exist; before that a bad first contact is an ordinary foul.
  const penalizable = regional && !breaking && groups[shooter] !== null
  let foul: Foul | null = null
  if (report.firstContact === null) {
    foul = penalizable
      ? { message: 'The cue ball did not hit any ball.', ballInHand: false, penalized: true }
      : ballInHandFoul('The cue ball did not hit any ball.')
  }
  else if (!breaking && (groups[shooter] === null ? report.firstContact === 8 : eligibleForEight ? report.firstContact !== 8 : groupOf(report.firstContact) !== groups[shooter])) {
    foul = penalizable
      ? { message: 'The first ball hit was not one of your balls.', ballInHand: false, penalized: true }
      : ballInHandFoul('The first ball hit was not a valid target.')
  }
  else if (breaking && !objectPotted && report.railsAfterContact.filter(id => id !== 0).length < 4) {
    foul = ballInHandFoul('Invalid break: pocket a ball or drive four balls to a rail.')
  }
  else if (!regional && !objectPotted && report.railsAfterContact.length === 0) {
    foul = ballInHandFoul('No ball was pocketed and none hit a rail after contact.')
  }
  if (report.pocketed.includes(0))
    foul = regional ? { message: 'The cue ball was pocketed.', ballInHand: false, penalized: foul?.penalized } : ballInHandFoul('The cue ball was pocketed.')
  return foul
}

/** The first group potted on an open table becomes the shooter's; the opponent gets the other. */
function assignGroups(context: ShotContext, report: ShotReport): ShotOutcome['groups'] {
  const { shooter } = context
  const opponent = otherTeam(shooter)
  const groups: ShotOutcome['groups'] = [...context.groups]
  const first = report.pocketed.map(groupOf).find(group => group !== null)
  if (first && groups[shooter] === null) {
    groups[shooter] = first
    groups[opponent] = first === 'solids' ? 'stripes' : 'solids'
  }
  return groups
}

/** Uses the pre-shot groups, so an open table still assigns on a mixed pot. */
function pottedOpponentBall(context: ShotContext, report: ShotReport): boolean {
  const opponent = otherTeam(context.shooter)
  return !context.breaking && report.pocketed.some(id => groupOf(id) !== null && groupOf(id) === context.groups[opponent])
}

function keepsTurn(context: ShotContext, report: ShotReport, groups: ShotOutcome['groups']): boolean {
  const { shooter, breaking } = context
  // House rule: potting any opponent ball ends the turn, even alongside an own-group pot (not a foul).
  return !pottedOpponentBall(context, report) && report.pocketed.some(id => breaking ? id !== 0 : groupOf(id) !== null && groupOf(id) === groups[shooter])
}

export function evaluateShot(context: ShotContext, report: ShotReport): ShotOutcome {
  const { shooter, breaking, eligibleForEight } = context
  const opponent = otherTeam(shooter)
  const found = findFoul(context, report)
  const foul = found?.message ?? null
  let winner: Team | null = null
  if (!breaking && report.pocketed.includes(8))
    winner = eligibleForEight && !foul ? shooter : opponent
  const groups = !breaking && !foul ? assignGroups(context, report) : [...context.groups] as ShotOutcome['groups']
  const retained = !foul && keepsTurn(context, report, groups)
  const scratched = report.pocketed.includes(0)
  const dropsOpponentBall = context.mode === 'regional' && !breaking && context.groups[shooter] !== null && Boolean(found?.penalized || scratched || pottedOpponentBall(context, report))
  return { groups, next: retained ? shooter : opponent, foul, winner, respotEight: breaking && report.pocketed.includes(8), ballInHand: found?.ballInHand ?? false, respotCue: context.mode === 'regional' && scratched, dropsOpponentBall }
}

/** Lowest-numbered ball of `group` still on the table (the eight is never part of a group). */
export function lowestBall(balls: Ball[], group: Group | null): number | null {
  const ids = balls.filter(ball => !ball.pocketed && group !== null && groupOf(ball.id) === group).map(ball => ball.id)
  return ids.length > 0 ? Math.min(...ids) : null
}

export function hasClearedGroup(balls: Ball[], group: Group | null): boolean {
  return group !== null && !balls.some(ball => !ball.pocketed && groupOf(ball.id) === group)
}
