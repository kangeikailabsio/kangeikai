import type { GameFormat, Seat, ShotContext, Team } from '@kangeikai/game-pool/core'
import type { ShotReport } from '@kangeikai/game-pool/physics'
import type { PoolCommand, PoolEvent, PoolSnapshot } from '@kangeikai/game-pool/protocol'
import type { AvatarSpriteType, GameTable } from '@kangeikai/shared'
import { BotBrain } from '@kangeikai/game-pool/bot'
import { evaluateShot, hasClearedGroup, lowestBall, nextSeat, otherTeam, seatCountOf, seatsOfTeam, teamOfSeat } from '@kangeikai/game-pool/core'
import { canPlaceBall, createRack, emptyReport, FIXED_STEP, respotCue, respotEight, stepPhysics, strikeCue } from '@kangeikai/game-pool/physics'
import { poolCommandSchema, SHOT_TIME_MS, SNAPSHOT_INTERVAL_MS } from '@kangeikai/game-pool/protocol'
import { distanceToTable, GAME_INTERACTION_DISTANCE } from '@kangeikai/shared'
import * as v from 'valibot'

interface Member { name: string, spriteType: AvatarSpriteType, connected: boolean }
interface TableSession {
  state: PoolSnapshot
  members: Map<string, Member>
  report: ShotReport
  context: ShotContext | null
  accumulator: number
  lastBroadcast: number
  /** Seats in the order they shoot; the turn moves to the next one when it is lost. */
  order: Seat[]
  /** Session ids in the order they sat, used to place players when the format changes. */
  sitOrder: string[]
  nextBreaker: Team
  /** Session that may pick the mode before a match; falls to the other seated player when it leaves. */
  owner: string | null
  /** Set on tables where the second seat is the server-side bot. */
  bot: { seat: Seat, brain: BotBrain } | null
}

const BOT_NAME = 'Bot'
const BOT_SPRITE: AvatarSpriteType = 'man'

export interface PoolHost {
  identity: (sessionId: string) => { name: string, spriteType: AvatarSpriteType, x: number, y: number, available: boolean } | undefined
  send: (sessionId: string, event: PoolEvent) => void
  now?: () => number
  random?: () => number
}

/** One manager per OfficeRoom. Its only transport dependency is the host's targeted send. */
export class PoolManager {
  private readonly sessions = new Map<string, TableSession>()
  private readonly membership = new Map<string, string>()
  private readonly now: () => number
  private readonly random: () => number
  private nextMatchId = 0

  constructor(private readonly tables: GameTable[], private readonly host: PoolHost) {
    this.now = host.now ?? Date.now
    this.random = host.random ?? Math.random
  }

  isAttached(id: string): boolean {
    return this.membership.has(id)
  }

  handle(id: string, input: unknown): void {
    const parsed = v.safeParse(poolCommandSchema, input)
    if (!parsed.success) {
      this.host.send(id, { kind: 'error', message: 'Invalid pool command.' })
      return
    }
    const command = parsed.output
    const reject = (message: string) => this.host.send(id, { kind: 'error', tableId: command.tableId, message })
    if (command.kind === 'open') {
      this.open(id, command.tableId, reject)
      return
    }
    const table = this.sessions.get(command.tableId)
    if (!table || this.membership.get(id) !== command.tableId || !table.members.get(id)?.connected) {
      reject('Open this table before interacting.')
      return
    }
    const s = table.state
    const index = s.players.findIndex(player => player?.sessionId === id)
    if (command.kind === 'leave') {
      this.leave(id)
      return
    }
    if (command.kind === 'sit') {
      if (s.phase === 'aiming' || s.phase === 'moving') {
        reject('You cannot change seats during a match.')
        return
      }
      const seatCount = s.players.length
      const team = seatCount > 2 ? command.team : undefined
      if (seatCount > 2 && team === undefined) {
        reject('Choose a team.')
        return
      }
      const free = s.players.findIndex((player, seat) => player === null && (team === undefined || teamOfSeat(seat, seatCount) === team))
      if (index >= 0) {
        if (team === undefined || teamOfSeat(index, seatCount) === team)
          return
        if (free < 0) {
          reject('That team is full.')
          return
        }
        s.players[free] = s.players[index]
        s.players[index] = null
        this.resetReady(table)
      }
      else {
        if (free < 0) {
          reject(seatCount > 2 ? 'That team is full.' : 'Both seats are taken.')
          return
        }
        const member = table.members.get(id)!
        s.players[free] = { sessionId: id, name: member.name, spriteType: member.spriteType, ready: false, connected: true }
        table.sitOrder = [...table.sitOrder.filter(seated => seated !== id), id]
      }
      this.syncOwner(table)
    }
    else if (command.kind === 'playBot') {
      if (index >= 0 || s.players.some(Boolean) || s.phase === 'aiming' || s.phase === 'moving') {
        reject('The bot only plays on an empty table.')
        return
      }
      if (s.format !== '1v1')
        this.changeFormat(table, '1v1')
      const member = table.members.get(id)!
      table.sitOrder = [id]
      s.players[0] = { sessionId: id, name: member.name, spriteType: member.spriteType, ready: false, connected: true }
      s.players[1] = { sessionId: `bot:${command.tableId}`, name: BOT_NAME, spriteType: BOT_SPRITE, ready: true, connected: true }
      table.bot = { seat: 1, brain: new BotBrain(this.random) }
      table.nextBreaker = 0
      this.syncOwner(table)
    }
    else if (command.kind === 'setMode' || command.kind === 'setFormat') {
      if (index < 0 || index !== s.ownerSeat || (s.phase !== 'waiting' && s.phase !== 'finished')) {
        reject('Only the table owner can change the rules, before the match starts.')
        return
      }
      if (command.kind === 'setMode') {
        if (command.mode !== s.mode) {
          s.mode = command.mode
          this.resetReady(table)
        }
      }
      else if (command.format !== s.format) {
        if (table.bot) {
          reject('The bot only plays 1 vs 1.')
          return
        }
        this.changeFormat(table, command.format)
        this.resetReady(table)
      }
    }
    else if (command.kind === 'stand') {
      if (index >= 0) {
        this.forfeit(table, index)
        s.players[index] = null
        this.removeBot(table)
        this.syncOwner(table)
        this.resetReady(table)
      }
    }
    else if (command.kind === 'ready') {
      if (index < 0 || (s.phase !== 'waiting' && s.phase !== 'finished')) {
        reject('You cannot get ready right now.')
        return
      }
      s.players[index]!.ready = command.ready
      if (s.players.every(player => player?.ready && player.connected))
        this.start(table)
    }
    else if (!this.takeTurn(table, index, command, reject)) {
      return
    }
    this.broadcast(table)
  }

  /** Validates and applies a place/shoot command for the seat at `index`; false when it was rejected. */
  private takeTurn(table: TableSession, index: number, command: Extract<PoolCommand, { kind: 'place' | 'shoot' }>, reject: (message: string) => void): boolean {
    const s = table.state
    if (index !== s.turn || index < 0 || s.phase !== 'aiming' || s.paused || command.matchId !== s.matchId || command.turnId !== s.turnId) {
      reject('This move is not available.')
      return false
    }
    if (s.deadline !== null && this.now() >= s.deadline) {
      this.timeout(table)
      reject('Your time to shoot is up.')
      return false
    }
    const cue = s.balls.find(ball => ball.id === 0)!
    if (command.kind === 'place') {
      if (!s.ballInHand || !canPlaceBall(s.balls, 0, command.x, command.y)) {
        reject('Invalid position for the cue ball.')
        return false
      }
      Object.assign(cue, { x: command.x, y: command.y, vx: 0, vy: 0, pocketed: false })
      s.cuePlaced = true
    }
    else {
      if (!s.cuePlaced || cue.pocketed) {
        reject('Place the cue ball before shooting.')
        return false
      }
      this.shoot(table, command)
    }
    return true
  }

  private open(id: string, tableId: string, reject: (message: string) => void): void {
    const attached = this.membership.get(id)
    if (attached === tableId) {
      const table = this.sessions.get(tableId)!
      this.sendSnapshot(table, id)
      return
    }
    const definition = this.tables.find(table => table.id === tableId)
    const identity = this.host.identity(id)
    if (attached || !definition || !identity || !identity.available || distanceToTable(definition, identity.x, identity.y) > GAME_INTERACTION_DISTANCE) {
      reject('Move close to the table and be available to open pool.')
      return
    }
    let table = this.sessions.get(tableId)
    if (!table) {
      table = {
        state: {
          tableId,
          matchId: 0,
          turnId: 0,
          revision: 0,
          serverTime: this.now(),
          phase: 'waiting',
          mode: '8-ball',
          format: '1v1',
          order: [0, 1],
          ownerSeat: null,
          players: [null, null],
          spectators: 0,
          balls: createRack(),
          groups: [null, null],
          turn: 0,
          breaking: true,
          ballInHand: false,
          cuePlaced: true,
          deadline: null,
          paused: false,
          remainingMs: SHOT_TIME_MS,
          winner: null,
          notice: 'Take a seat and confirm you are ready.',
        },
        members: new Map(),
        report: emptyReport(),
        context: null,
        accumulator: 0,
        lastBroadcast: 0,
        order: [0, 1],
        sitOrder: [],
        nextBreaker: this.random() < 0.5 ? 0 : 1,
        bot: null,
        owner: null,
      }
      this.sessions.set(tableId, table)
    }
    table.members.set(id, { name: identity.name, spriteType: identity.spriteType, connected: true })
    this.membership.set(id, tableId)
    this.broadcast(table)
  }

  /** Re-seats everyone for the new format in the order they sat, alternating Team A and Team B; the overflow becomes spectators. */
  private changeFormat(table: TableSession, format: GameFormat): void {
    const s = table.state
    const seatCount = seatCountOf(format)
    const seated = table.sitOrder.map(id => s.players.find(player => player?.sessionId === id)).filter(player => player != null)
    const players: typeof s.players = Array.from({ length: seatCount }, () => null)
    seated.slice(0, seatCount).forEach((player, position) => {
      const seat = seatsOfTeam(position % 2 === 0 ? 0 : 1, seatCount).find(candidate => players[candidate] === null)!
      players[seat] = player
    })
    s.players = players
    s.format = format
    s.order = Array.from({ length: seatCount }, (_, seat) => seat)
    table.order = s.order
    this.syncOwner(table)
  }

  /** Draws who shoots first inside each team and interleaves the teams, starting with the one that breaks. */
  private drawOrder(table: TableSession): Seat[] {
    const seatCount = table.state.players.length
    const draw = (team: Team) => {
      const seats = seatsOfTeam(team, seatCount)
      for (let i = seats.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [seats[i], seats[j]] = [seats[j], seats[i]]
      }
      return seats
    }
    const first = draw(table.nextBreaker)
    const second = draw(otherTeam(table.nextBreaker))
    return first.flatMap((seat, position) => [seat, second[position]])
  }

  private start(table: TableSession): void {
    const s = table.state
    table.order = this.drawOrder(table)
    s.order = table.order
    Object.assign(s, {
      matchId: ++this.nextMatchId,
      turnId: 1,
      balls: createRack(),
      groups: [null, null],
      turn: table.order[0],
      phase: 'aiming',
      breaking: true,
      ballInHand: false,
      cuePlaced: true,
      winner: null,
      notice: 'Break: pocket a ball or drive four balls to a rail.',
      paused: false,
      remainingMs: SHOT_TIME_MS,
      deadline: this.now() + SHOT_TIME_MS,
    })
    // Against the bot the human always breaks, so the alternation is skipped.
    if (!table.bot)
      table.nextBreaker = otherTeam(table.nextBreaker)
    table.accumulator = 0
    table.context = null
    this.resetReady(table)
  }

  /** Clears everyone's ready flag, except the bot's: it is always ready for the next match. */
  private resetReady(table: TableSession): void {
    table.state.players.forEach((player, seat) => {
      if (player)
        player.ready = table.bot?.seat === seat
    })
  }

  /** Keeps `owner` on a seated human: the previous owner while seated, else whoever sits first. */
  private syncOwner(table: TableSession): void {
    const s = table.state
    let seat = table.owner ? s.players.findIndex(player => player?.sessionId === table.owner) : -1
    if (seat < 0)
      seat = s.players.findIndex((player, index) => player !== null && table.bot?.seat !== index)
    table.owner = seat >= 0 ? s.players[seat]!.sessionId : null
    s.ownerSeat = seat >= 0 ? seat : null
  }

  private teamOf(table: TableSession, seat: Seat): Team {
    return teamOfSeat(seat, table.state.players.length)
  }

  private removeBot(table: TableSession): void {
    if (!table.bot)
      return
    table.state.players[table.bot.seat] = null
    table.bot = null
  }

  private shoot(table: TableSession, command: Extract<PoolCommand, { kind: 'shoot' }>): void {
    const s = table.state
    const shooter = this.teamOf(table, s.turn)
    table.context = { mode: s.mode, shooter, groups: [...s.groups], breaking: s.breaking, eligibleForEight: hasClearedGroup(s.balls, s.groups[shooter]) }
    table.report = emptyReport()
    table.accumulator = 0
    strikeCue(s.balls, command.angle, command.power)
    s.phase = 'moving'
    s.deadline = null
    s.ballInHand = false
    s.notice = 'Balls in motion…'
  }

  tick(deltaMs: number): void {
    const now = this.now()
    for (const table of this.sessions.values()) {
      const s = table.state
      if (table.bot && s.phase === 'aiming' && !s.paused && s.turn === table.bot.seat)
        this.driveBot(table, table.bot, now)
      if (s.phase === 'moving') {
        table.accumulator += Math.min(Math.max(deltaMs, 0), 250) / 1000
        while (table.accumulator >= FIXED_STEP && s.phase === 'moving') {
          table.accumulator -= FIXED_STEP
          if (!stepPhysics(s.balls, table.report))
            this.resolve(table)
        }
        // Only evaluated on the room's 60Hz ticks, so the real period alternates ~50/66.7ms — which
        // is why the client simulates between snapshots instead of interpolating over a fixed window.
        if (now - table.lastBroadcast >= SNAPSHOT_INTERVAL_MS)
          this.broadcast(table)
      }
      else if (s.phase === 'aiming' && !s.paused && s.deadline !== null && now >= s.deadline) {
        this.timeout(table)
      }
    }
  }

  /** Gives the bot one slice of work; it plans over several ticks and acts through the same rules as a human. */
  private driveBot(table: TableSession, bot: NonNullable<TableSession['bot']>, now: number): void {
    const s = table.state
    const action = bot.brain.update({ mode: s.mode, team: this.teamOf(table, bot.seat), groups: s.groups, breaking: s.breaking, balls: s.balls, matchId: s.matchId, turnId: s.turnId, ballInHand: s.ballInHand, cuePlaced: s.cuePlaced }, now)
    if (!action)
      return
    const turn = { tableId: s.tableId, matchId: s.matchId, turnId: s.turnId }
    const command: Extract<PoolCommand, { kind: 'place' | 'shoot' }> = action.kind === 'place' ? { kind: 'place', ...turn, x: action.x, y: action.y } : { kind: 'shoot', ...turn, angle: action.angle, power: action.power }
    if (this.takeTurn(table, bot.seat, command, () => {}))
      this.broadcast(table)
  }

  private resolve(table: TableSession): void {
    const s = table.state
    const outcome = evaluateShot(table.context!, table.report)
    s.groups = outcome.groups
    if (outcome.respotEight)
      respotEight(s.balls)
    if (outcome.winner !== null) {
      this.finish(table, outcome.winner, 'Match ended by the 8 ball.')
    }
    else {
      const shooter = table.context!.shooter
      const dropped = outcome.dropsOpponentBall ? this.dropOpponentBall(table, outcome.groups[otherTeam(shooter)]) : null
      if (outcome.respotCue)
        respotCue(s.balls)
      s.turn = outcome.next === shooter ? s.turn : nextSeat(table.order, s.turn)
      s.breaking = false
      s.ballInHand = outcome.ballInHand
      s.cuePlaced = !s.ballInHand
      s.notice = outcome.foul
        ? [outcome.foul, outcome.ballInHand ? 'Ball in hand for the opponent.' : 'Turn lost.', dropped !== null && `The opponent's ball ${dropped} was pocketed.`, outcome.respotCue && 'The cue ball returns to the starting spot.'].filter(Boolean).join(' ')
        : dropped !== null
          ? `An opponent's ball was pocketed: turn lost. The opponent's ball ${dropped} was pocketed too.`
          : 'Your turn to aim.'
      this.nextTurn(table)
    }
    table.context = null
    this.broadcast(table)
  }

  /** Regional penalty: pockets the opponent's lowest remaining group ball for them. */
  private dropOpponentBall(table: TableSession, group: ShotContext['groups'][number]): number | null {
    const id = lowestBall(table.state.balls, group)
    const ball = table.state.balls.find(candidate => candidate.id === id)
    if (!ball)
      return null
    Object.assign(ball, { pocketed: true, vx: 0, vy: 0 })
    return ball.id
  }

  private nextTurn(table: TableSession): void {
    const s = table.state
    s.turnId++
    s.phase = 'aiming'
    s.remainingMs = SHOT_TIME_MS
    s.paused = s.players.some(player => !player?.connected)
    s.deadline = s.paused ? null : this.now() + SHOT_TIME_MS
  }

  private timeout(table: TableSession): void {
    const s = table.state
    s.turn = nextSeat(table.order, s.turn)
    s.breaking = false
    s.ballInHand = true
    s.cuePlaced = false
    s.notice = 'Time is up. Ball in hand for the opponent.'
    this.nextTurn(table)
    this.broadcast(table)
  }

  private finish(table: TableSession, winner: Team | null, notice: string): void {
    const s = table.state
    Object.assign(s, { phase: 'finished', winner, notice, deadline: null, paused: false })
    s.balls.forEach((ball) => {
      ball.vx = ball.vy = 0
    })
    this.resetReady(table)
  }

  private forfeit(table: TableSession, seat: Seat): void {
    const s = table.state
    if (s.phase !== 'aiming' && s.phase !== 'moving')
      return
    const opponent = otherTeam(this.teamOf(table, seat))
    const winner = s.players.some((player, index) => player?.connected && this.teamOf(table, index) === opponent) ? opponent : null
    this.finish(table, winner, winner === null ? 'Match cancelled: players disconnected.' : 'Win by opponent forfeit.')
  }

  leave(id: string): void {
    const tableId = this.membership.get(id)
    const table = tableId ? this.sessions.get(tableId) : undefined
    if (!table)
      return
    const index = table.state.players.findIndex(player => player?.sessionId === id)
    if (index >= 0) {
      this.forfeit(table, index)
      table.state.players[index] = null
      this.removeBot(table)
      this.syncOwner(table)
      this.resetReady(table)
    }
    table.members.delete(id)
    this.membership.delete(id)
    this.host.send(id, { kind: 'closed', tableId: table.state.tableId })
    if (table.members.size === 0)
      this.sessions.delete(table.state.tableId)
    else
      this.broadcast(table)
  }

  drop(id: string): void {
    const table = this.sessions.get(this.membership.get(id) ?? '')
    if (!table)
      return
    table.members.get(id)!.connected = false
    const player = table.state.players.find(p => p?.sessionId === id)
    if (player) {
      player.connected = false
      const s = table.state
      if (s.phase === 'aiming' && !s.paused) {
        s.remainingMs = Math.max(0, (s.deadline ?? this.now()) - this.now())
        s.deadline = null
        s.paused = true
      }
    }
    this.broadcast(table)
  }

  reconnect(id: string): void {
    const table = this.sessions.get(this.membership.get(id) ?? '')
    if (!table)
      return
    table.members.get(id)!.connected = true
    const player = table.state.players.find(p => p?.sessionId === id)
    if (player)
      player.connected = true
    const s = table.state
    if (s.phase === 'aiming' && s.paused && s.players.every(p => p?.connected)) {
      s.paused = false
      s.deadline = this.now() + s.remainingMs
    }
    this.broadcast(table)
  }

  private sendSnapshot(table: TableSession, id: string): void {
    this.host.send(id, { kind: 'snapshot', state: { ...structuredClone(table.state), serverTime: this.now() } })
  }

  private broadcast(table: TableSession): void {
    const s = table.state
    s.serverTime = this.now()
    s.revision++
    let spectators = 0
    for (const [id, member] of table.members) {
      if (member.connected && !s.players.some(player => player?.sessionId === id))
        spectators++
    }
    s.spectators = spectators
    table.lastBroadcast = s.serverTime
    // Cloned once, not once per recipient: the clone is never mutated after being handed to the
    // transport, and the next broadcast makes a fresh one.
    const state = structuredClone(s)
    for (const [id, member] of table.members) {
      if (member.connected)
        this.host.send(id, { kind: 'snapshot', state })
    }
  }

  dispose(): void {
    this.sessions.clear()
    this.membership.clear()
  }
}
