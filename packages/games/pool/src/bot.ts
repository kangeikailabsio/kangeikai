/**
 * Medium-difficulty eight-ball bot. Pure and Phaser-free: the PoolManager feeds it the table state
 * every tick and executes whatever it returns. All randomness is injected so tests are deterministic.
 *
 * The bot picks (target ball, pocket) pairs with the ghost-ball method, simulates the best few with
 * the real physics, and scores the outcome with the real rules. It then misses on purpose: angle and
 * power noise, plus the occasional second-best choice. It does not plan cue-ball position.
 */
import type { GameMode, Group, ShotContext, Team } from '@kangeikai/game-pool/core'
import type { Ball, ShotReport } from '@kangeikai/game-pool/physics'
import { evaluateShot, groupOf, hasClearedGroup, otherTeam } from '@kangeikai/game-pool/core'
import { BALL_RADIUS, canPlaceBall, emptyReport, MAX_SHOT_SPEED, POCKETS, stepPhysics, strikeCue, TABLE_HEIGHT, TABLE_WIDTH } from '@kangeikai/game-pool/physics'

export const BOT_THINK_MS = 1500
/** Simulating is the expensive part, so only this many candidates are tried per shot. */
export const BOT_SIMULATED_CANDIDATES = 5
/** Chance of playing the 2nd or 3rd best candidate instead of the best. */
const SECOND_BEST_CHANCE = 0.12
const ANGLE_SIGMA_BASE_DEG = 0.5
const ANGLE_SIGMA_MAX_DEG = 1.6
/** Extra degrees of angle noise per world unit travelled by the cue and the object ball. */
const ANGLE_SIGMA_PER_UNIT = 1.1 / 600
const POWER_NOISE = 0.06
const DECELERATION = 120
/** Thinnest cut the bot will try, as cos(angle between the aim line and the pot line). */
const MIN_CUT_COS = 0.35
const POWER_MARGIN = 1.25
const MIN_POWER = 0.12
const FALLBACK_POWER = 0.45
const MAX_SIMULATION_STEPS = 120 * 25
const PLACEMENT_STEP = 50
const PLACEMENT_MARGIN = 30

export interface BotView {
  mode: GameMode
  team: Team
  groups: [Group | null, Group | null]
  breaking: boolean
  balls: Ball[]
}

export interface BotTurnView extends BotView {
  matchId: number
  turnId: number
  ballInHand: boolean
  cuePlaced: boolean
}

export interface Candidate {
  target: number
  angle: number
  power: number
  /** Cue-to-ghost plus object-ball-to-pocket distance. */
  path: number
  difficulty: number
}

export interface BotShot { angle: number, power: number }
export type BotAction = { kind: 'place', x: number, y: number } | ({ kind: 'shoot' } & BotShot)

interface Point { x: number, y: number }

export function legalTargets(view: BotView): number[] {
  const own = view.groups[view.team]
  const remaining = view.balls.filter(ball => ball.id !== 0 && !ball.pocketed)
  if (view.breaking || own === null)
    return remaining.filter(ball => groupOf(ball.id) !== null).map(ball => ball.id)
  if (hasClearedGroup(view.balls, own))
    return remaining.filter(ball => ball.id === 8).map(ball => ball.id)
  return remaining.filter(ball => groupOf(ball.id) === own).map(ball => ball.id)
}

/** True when no ball other than `ignore` comes within two radii of the segment a-b. */
function segmentClear(balls: Ball[], a: Point, b: Point, ignore: number[]): boolean {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy || 1
  for (const ball of balls) {
    if (ball.pocketed || ignore.includes(ball.id))
      continue
    const t = Math.max(0, Math.min(1, ((ball.x - a.x) * dx + (ball.y - a.y) * dy) / lengthSquared))
    if (Math.hypot(a.x + dx * t - ball.x, a.y + dy * t - ball.y) < 2 * BALL_RADIUS)
      return false
  }
  return true
}

function powerFor(cueDistance: number, objectDistance: number, cos: number): number {
  const targetSpeed = Math.sqrt(2 * DECELERATION * objectDistance)
  const impactSpeed = targetSpeed / (Math.max(cos, MIN_CUT_COS) * 0.98)
  const launchSpeed = Math.sqrt(impactSpeed * impactSpeed + 2 * DECELERATION * cueDistance) * POWER_MARGIN
  return Math.min(1, Math.max(MIN_POWER, launchSpeed / MAX_SHOT_SPEED))
}

/** Every clear (target, pocket) shot from `cue`, easiest first. Falls back to straight hits when none exist. */
export function generateCandidates(balls: Ball[], cue: Point, targets: number[]): Candidate[] {
  const candidates: Candidate[] = []
  for (const id of targets) {
    const target = balls.find(ball => ball.id === id)
    if (!target)
      continue
    for (const pocket of POCKETS) {
      // Rails keep ball centers off the pocket centre, so aim at the nearest point a ball can reach.
      const aim = { x: Math.min(TABLE_WIDTH - BALL_RADIUS, Math.max(BALL_RADIUS, pocket.x)), y: Math.min(TABLE_HEIGHT - BALL_RADIUS, Math.max(BALL_RADIUS, pocket.y)) }
      const length = Math.hypot(aim.x - target.x, aim.y - target.y)
      if (length < 1)
        continue
      const ux = (aim.x - target.x) / length
      const uy = (aim.y - target.y) / length
      const ghost = { x: target.x - ux * 2 * BALL_RADIUS, y: target.y - uy * 2 * BALL_RADIUS }
      if (ghost.x < BALL_RADIUS || ghost.x > TABLE_WIDTH - BALL_RADIUS || ghost.y < BALL_RADIUS || ghost.y > TABLE_HEIGHT - BALL_RADIUS)
        continue
      const cueDistance = Math.hypot(ghost.x - cue.x, ghost.y - cue.y)
      if (cueDistance < 1e-6)
        continue
      const cos = ((ghost.x - cue.x) * ux + (ghost.y - cue.y) * uy) / cueDistance
      if (cos < MIN_CUT_COS || !segmentClear(balls, cue, ghost, [0, id]) || !segmentClear(balls, target, aim, [0, id]))
        continue
      candidates.push({
        target: id,
        angle: Math.atan2(ghost.y - cue.y, ghost.x - cue.x),
        power: powerFor(cueDistance, length, cos),
        path: cueDistance + length,
        difficulty: (cueDistance + length) / 600 + (1 - cos) * 1.5,
      })
    }
  }
  if (candidates.length > 0)
    return candidates.sort((a, b) => a.difficulty - b.difficulty)
  return targets
    .map((id) => {
      const target = balls.find(ball => ball.id === id)!
      const distance = Math.hypot(target.x - cue.x, target.y - cue.y)
      return { target: id, angle: Math.atan2(target.y - cue.y, target.x - cue.x), power: FALLBACK_POWER, path: distance, difficulty: 99 + distance }
    })
    .sort((a, b) => a.difficulty - b.difficulty)
}

export function simulateShot(balls: Ball[], angle: number, power: number): { balls: Ball[], report: ShotReport } {
  const copy = balls.map(ball => ({ ...ball }))
  const report = emptyReport()
  strikeCue(copy, angle, power)
  for (let step = 0; step < MAX_SIMULATION_STEPS && stepPhysics(copy, report); step++);
  return { balls: copy, report }
}

/** Higher is better. Uses the real rules, so fouls and early eights are punished exactly as the server would. */
export function scoreShot(view: BotView, report: ShotReport): number {
  const context: ShotContext = { mode: view.mode, shooter: view.team, groups: [...view.groups], breaking: view.breaking, eligibleForEight: hasClearedGroup(view.balls, view.groups[view.team]) }
  const outcome = evaluateShot(context, report)
  const opponent = otherTeam(view.team)
  let score = 0
  if (outcome.winner === view.team)
    score += 1000
  else if (outcome.winner === opponent)
    score -= 1000
  if (outcome.foul)
    score -= 300
  if (outcome.dropsOpponentBall)
    score -= 60
  else if (outcome.next === view.team)
    score += 100
  const own = outcome.groups[view.team]
  for (const id of report.pocketed) {
    const group = groupOf(id)
    if (group === null)
      continue
    score += group === own ? 50 : own === null ? 0 : -40
  }
  return score
}

function gaussian(random: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(random(), 1e-9))) * Math.cos(2 * Math.PI * random())
}

/** Adds the "medium" imperfection: angle noise growing with distance, and ±8% power noise. */
export function applyNoise(candidate: Candidate, random: () => number): BotShot {
  const sigmaDegrees = Math.min(ANGLE_SIGMA_MAX_DEG, ANGLE_SIGMA_BASE_DEG + ANGLE_SIGMA_PER_UNIT * candidate.path)
  const angle = candidate.angle + gaussian(random) * sigmaDegrees * Math.PI / 180
  const power = candidate.power * (1 + (random() * 2 - 1) * POWER_NOISE)
  return { angle: Math.atan2(Math.sin(angle), Math.cos(angle)), power: Math.min(1, Math.max(0.01, power)) }
}

/**
 * Plans one shot incrementally: `step()` simulates a single candidate, so the caller can spread the
 * cost over several server ticks instead of stalling the 60 Hz loop.
 */
export class ShotPlanner {
  private readonly queue: Candidate[]
  private readonly evaluated: { candidate: Candidate, score: number }[] = []

  constructor(private readonly view: BotView, private readonly random: () => number) {
    const cue = view.balls.find(ball => ball.id === 0)!
    this.queue = generateCandidates(view.balls, cue, legalTargets(view)).slice(0, BOT_SIMULATED_CANDIDATES)
  }

  get done(): boolean {
    return this.queue.length === 0
  }

  step(): void {
    const candidate = this.queue.shift()
    if (!candidate)
      return
    const { report } = simulateShot(this.view.balls, candidate.angle, candidate.power)
    this.evaluated.push({ candidate, score: scoreShot(this.view, report) })
  }

  result(): BotShot {
    const ranked = [...this.evaluated].sort((a, b) => b.score - a.score || a.candidate.difficulty - b.candidate.difficulty)
    if (ranked.length === 0) {
      const cue = this.view.balls.find(ball => ball.id === 0)!
      const nearest = this.view.balls.filter(ball => ball.id !== 0 && !ball.pocketed).sort((a, b) => Math.hypot(a.x - cue.x, a.y - cue.y) - Math.hypot(b.x - cue.x, b.y - cue.y))[0]
      return { angle: nearest ? Math.atan2(nearest.y - cue.y, nearest.x - cue.x) : 0, power: FALLBACK_POWER }
    }
    const pick = ranked.length > 1 && this.random() < SECOND_BEST_CHANCE ? 1 + Math.floor(this.random() * Math.min(2, ranked.length - 1)) : 0
    return applyNoise(ranked[pick].candidate, this.random)
  }
}

/** Synchronous convenience for tests and tools. */
export function planShot(view: BotView, random: () => number): BotShot {
  const planner = new ShotPlanner(view, random)
  while (!planner.done)
    planner.step()
  return planner.result()
}

/** Ball in hand: the legal grid position with the easiest available shot. */
export function chooseCuePosition(view: BotView): Point {
  const targets = legalTargets(view)
  let best: Point | null = null
  let bestDifficulty = Infinity
  let firstValid: Point | null = null
  for (let x = PLACEMENT_MARGIN; x <= TABLE_WIDTH - PLACEMENT_MARGIN; x += PLACEMENT_STEP) {
    for (let y = PLACEMENT_MARGIN; y <= TABLE_HEIGHT - PLACEMENT_MARGIN; y += PLACEMENT_STEP) {
      if (!canPlaceBall(view.balls, 0, x, y))
        continue
      firstValid ??= { x, y }
      const difficulty = generateCandidates(view.balls, { x, y }, targets)[0]?.difficulty ?? Infinity
      if (difficulty < bestDifficulty) {
        bestDifficulty = difficulty
        best = { x, y }
      }
    }
  }
  return best ?? firstValid ?? { x: 200, y: 200 }
}

/** Per-table bot state: waits a think delay, places the cue if needed, plans across ticks, then shoots. */
export class BotBrain {
  private key = ''
  private readyAt = 0
  private position: Point | null = null
  private placed = false
  private planner: ShotPlanner | null = null
  private shot: BotShot | null = null
  private shotSent = false

  constructor(private readonly random: () => number, private readonly thinkMs = BOT_THINK_MS) {}

  update(view: BotTurnView, now: number): BotAction | null {
    const key = `${view.matchId}:${view.turnId}`
    if (key !== this.key) {
      Object.assign(this, { key, readyAt: now + this.thinkMs, position: null, placed: false, planner: null, shot: null, shotSent: false })
    }
    if (view.ballInHand && !view.cuePlaced) {
      this.position ??= chooseCuePosition(view)
      if (this.placed || now < this.readyAt)
        return null
      this.placed = true
      this.readyAt = now + this.thinkMs
      return { kind: 'place', ...this.position }
    }
    if (this.shotSent)
      return null
    this.planner ??= new ShotPlanner(view, this.random)
    if (!this.planner.done) {
      this.planner.step()
      return null
    }
    this.shot ??= this.planner.result()
    if (now < this.readyAt)
      return null
    this.shotSent = true
    return { kind: 'shoot', ...this.shot }
  }
}
