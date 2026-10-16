import type { Seat, ShotContext } from '@kangeikai/game-pool/core'
import type { ShotReport } from '@kangeikai/game-pool/physics'
import type { PoolCommand, PoolEvent, PoolSnapshot } from '@kangeikai/game-pool/protocol'
import type { AvatarSpriteType, GameTable } from '@kangeikai/shared'
import { evaluateShot, hasClearedGroup } from '@kangeikai/game-pool/core'
import { canPlaceBall, createRack, emptyReport, FIXED_STEP, MAX_SHOT_SPEED, respotEight, stepPhysics } from '@kangeikai/game-pool/physics'
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
  nextBreaker: Seat
}

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
      this.host.send(id, { kind: 'error', message: 'Comando de sinuca inválido.' })
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
      reject('Abra esta mesa antes de interagir.')
      return
    }
    const s = table.state
    const index = s.players.findIndex(player => player?.sessionId === id)
    if (command.kind === 'leave') {
      this.leave(id)
      return
    }
    if (command.kind === 'sit') {
      if (index >= 0)
        return
      const free = s.players.findIndex(player => player === null)
      if (free < 0 || s.phase === 'aiming' || s.phase === 'moving') {
        reject('As duas vagas estão ocupadas.')
        return
      }
      const member = table.members.get(id)!
      s.players[free] = { sessionId: id, name: member.name, spriteType: member.spriteType, ready: false, connected: true }
    }
    else if (command.kind === 'stand') {
      if (index >= 0) {
        this.forfeit(table, index as Seat)
        s.players[index] = null
        s.players.forEach((player) => {
          if (player)
            player.ready = false
        })
      }
    }
    else if (command.kind === 'ready') {
      if (index < 0 || (s.phase !== 'waiting' && s.phase !== 'finished')) {
        reject('Você não pode ficar pronto agora.')
        return
      }
      s.players[index]!.ready = command.ready
      if (s.players.every(player => player?.ready && player.connected))
        this.start(table)
    }
    else {
      if (index !== s.turn || index < 0 || s.phase !== 'aiming' || s.paused || command.matchId !== s.matchId || command.turnId !== s.turnId) {
        reject('Esta jogada não está disponível.')
        return
      }
      if (s.deadline !== null && this.now() >= s.deadline) {
        this.timeout(table)
        reject('O tempo da jogada terminou.')
        return
      }
      const cue = s.balls.find(ball => ball.id === 0)!
      if (command.kind === 'place') {
        if (!s.ballInHand || !canPlaceBall(s.balls, 0, command.x, command.y)) {
          reject('Posição inválida para a branca.')
          return
        }
        Object.assign(cue, { x: command.x, y: command.y, vx: 0, vy: 0, pocketed: false })
        s.cuePlaced = true
      }
      else if (command.kind === 'shoot') {
        if (!s.cuePlaced || cue.pocketed) {
          reject('Posicione a branca antes da tacada.')
          return
        }
        this.shoot(table, command)
      }
    }
    this.broadcast(table)
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
      reject('Aproxime-se da mesa e esteja disponível para abrir a sinuca.')
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
          notice: 'Ocupe uma vaga e confirme que está pronto.',
        },
        members: new Map(),
        report: emptyReport(),
        context: null,
        accumulator: 0,
        lastBroadcast: 0,
        nextBreaker: this.random() < 0.5 ? 0 : 1,
      }
      this.sessions.set(tableId, table)
    }
    table.members.set(id, { name: identity.name, spriteType: identity.spriteType, connected: true })
    this.membership.set(id, tableId)
    this.broadcast(table)
  }

  private start(table: TableSession): void {
    const s = table.state
    Object.assign(s, {
      matchId: ++this.nextMatchId,
      turnId: 1,
      balls: createRack(),
      groups: [null, null],
      turn: table.nextBreaker,
      phase: 'aiming',
      breaking: true,
      ballInHand: false,
      cuePlaced: true,
      winner: null,
      notice: 'Saída: encaçape uma bola ou leve quatro bolas às tabelas.',
      paused: false,
      remainingMs: SHOT_TIME_MS,
      deadline: this.now() + SHOT_TIME_MS,
    })
    table.nextBreaker = table.nextBreaker === 0 ? 1 : 0
    table.accumulator = 0
    table.context = null
    s.players.forEach((player) => {
      if (player)
        player.ready = false
    })
  }

  private shoot(table: TableSession, command: Extract<PoolCommand, { kind: 'shoot' }>): void {
    const s = table.state
    table.context = { shooter: s.turn, groups: [...s.groups], breaking: s.breaking, eligibleForEight: hasClearedGroup(s.balls, s.groups[s.turn]) }
    table.report = emptyReport()
    table.accumulator = 0
    const cue = s.balls.find(ball => ball.id === 0)!
    cue.vx = Math.cos(command.angle) * command.power * MAX_SHOT_SPEED
    cue.vy = Math.sin(command.angle) * command.power * MAX_SHOT_SPEED
    s.phase = 'moving'
    s.deadline = null
    s.ballInHand = false
    s.notice = 'Bolas em movimento…'
  }

  tick(deltaMs: number): void {
    const now = this.now()
    for (const table of this.sessions.values()) {
      const s = table.state
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

  private resolve(table: TableSession): void {
    const s = table.state
    const outcome = evaluateShot(table.context!, table.report)
    s.groups = outcome.groups
    if (outcome.respotEight)
      respotEight(s.balls)
    if (outcome.winner !== null) {
      this.finish(table, outcome.winner, 'Partida encerrada pela bola 8.')
    }
    else {
      s.turn = outcome.next
      s.breaking = false
      s.ballInHand = Boolean(outcome.foul)
      s.cuePlaced = !s.ballInHand
      s.notice = outcome.foul ? `${outcome.foul} Branca na mão para o adversário.` : 'Sua vez de mirar.'
      this.nextTurn(table)
    }
    table.context = null
    this.broadcast(table)
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
    s.turn = s.turn === 0 ? 1 : 0
    s.breaking = false
    s.ballInHand = true
    s.cuePlaced = false
    s.notice = 'Tempo esgotado. Branca na mão para o adversário.'
    this.nextTurn(table)
    this.broadcast(table)
  }

  private finish(table: TableSession, winner: Seat | null, notice: string): void {
    const s = table.state
    Object.assign(s, { phase: 'finished', winner, notice, deadline: null, paused: false })
    s.balls.forEach((ball) => {
      ball.vx = ball.vy = 0
    })
    s.players.forEach((player) => {
      if (player)
        player.ready = false
    })
  }

  private forfeit(table: TableSession, seat: Seat): void {
    const s = table.state
    if (s.phase !== 'aiming' && s.phase !== 'moving')
      return
    const opponent: Seat = seat === 0 ? 1 : 0
    const winner = s.players[opponent]?.connected ? opponent : null
    this.finish(table, winner, winner === null ? 'Partida cancelada: jogadores desconectados.' : 'Vitória por desistência do adversário.')
  }

  leave(id: string): void {
    const tableId = this.membership.get(id)
    const table = tableId ? this.sessions.get(tableId) : undefined
    if (!table)
      return
    const index = table.state.players.findIndex(player => player?.sessionId === id)
    if (index >= 0) {
      this.forfeit(table, index as Seat)
      table.state.players[index] = null
      table.state.players.forEach((player) => {
        if (player)
          player.ready = false
      })
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
      if (member.connected && s.players[0]?.sessionId !== id && s.players[1]?.sessionId !== id)
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
