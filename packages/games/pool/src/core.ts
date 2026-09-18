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

export interface ShotContext {
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
}

export function evaluateShot(context: ShotContext, report: ShotReport): ShotOutcome {
  const { shooter, breaking, eligibleForEight } = context
  const opponent: Seat = shooter === 0 ? 1 : 0
  const groups: ShotOutcome['groups'] = [...context.groups]
  let foul: string | null = null
  const objectPotted = report.pocketed.some(id => id !== 0)
  if (report.firstContact === null)
    foul = 'A branca não atingiu nenhuma bola.'
  else if (!breaking && (groups[shooter] === null ? report.firstContact === 8 : eligibleForEight ? report.firstContact !== 8 : groupOf(report.firstContact) !== groups[shooter]))
    foul = 'A primeira bola atingida não era um alvo válido.'
  else if (breaking && !objectPotted && report.railsAfterContact.filter(id => id !== 0).length < 4)
    foul = 'Saída inválida: encaçape uma bola ou leve quatro bolas às tabelas.'
  else if (!objectPotted && report.railsAfterContact.length === 0)
    foul = 'Nenhuma bola caiu ou tocou uma tabela após o contato.'
  if (report.pocketed.includes(0))
    foul = 'A branca foi encaçapada.'

  let winner: Seat | null = null
  if (!breaking && report.pocketed.includes(8))
    winner = eligibleForEight && !foul ? shooter : opponent
  if (!breaking && !foul && groups[shooter] === null) {
    const first = report.pocketed.map(groupOf).find(group => group !== null)
    if (first) {
      groups[shooter] = first
      groups[opponent] = first === 'solids' ? 'stripes' : 'solids'
    }
  }
  const keepsTurn = !foul && report.pocketed.some(id => breaking ? id !== 0 : groupOf(id) !== null && groupOf(id) === groups[shooter])
  return { groups, next: keepsTurn ? shooter : opponent, foul, winner, respotEight: breaking && report.pocketed.includes(8) }
}

export function hasClearedGroup(balls: Ball[], group: Group | null): boolean {
  return group !== null && !balls.some(ball => !ball.pocketed && groupOf(ball.id) === group)
}
