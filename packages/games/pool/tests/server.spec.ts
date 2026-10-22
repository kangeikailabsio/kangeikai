import type { PoolEvent, PoolSnapshot } from '@kangeikai/game-pool/protocol'
import { PoolManager } from '@kangeikai/game-pool/server'
import { beforeEach, describe, expect, it } from 'vitest'

let now: number
let manager: PoolManager
let snapshots: Map<string, PoolSnapshot>
let events: Map<string, PoolEvent>
let far: boolean

beforeEach(() => {
  now = 1000
  far = false
  snapshots = new Map()
  events = new Map()
  manager = new PoolManager([
    { id: 'one', gameType: 'pool', x: 0, y: 0, width: 100, height: 100 },
    { id: 'two', gameType: 'pool', x: 0, y: 0, width: 100, height: 100 },
  ], {
    now: () => now,
    random: () => 0,
    identity: id => ({ name: id, spriteType: 'man' as const, x: far ? 1000 : 50, y: 50, available: true }),
    send: (id, event) => {
      events.set(id, event)
      if (event.kind === 'snapshot')
        snapshots.set(id, event.state)
    },
  })
})

function open(id: string, tableId = 'one'): void {
  manager.handle(id, { kind: 'open', tableId })
}
function start(): void {
  for (const id of ['a', 'b']) {
    open(id)
    manager.handle(id, { kind: 'sit', tableId: 'one' })
    manager.handle(id, { kind: 'ready', tableId: 'one', ready: true })
  }
}
function shot(id = 'a'): void {
  const state = snapshots.get(id)!
  manager.handle(id, { kind: 'shoot', tableId: state.tableId, matchId: state.matchId, turnId: state.turnId, angle: 0, power: 1 })
}

describe('pool session authority', () => {
  it('requires proximity and rejects unknown tables and multiple memberships', () => {
    far = true
    open('a')
    expect(manager.isAttached('a')).toBe(false)
    far = false
    open('a', 'unknown')
    expect(manager.isAttached('a')).toBe(false)
    open('a')
    open('a', 'two')
    expect(events.get('a')?.kind).toBe('error')
    expect(snapshots.get('a')!.tableId).toBe('one')
  })
  it('opens as spectator, reserves only two seats, starts only after both are ready', () => {
    open('a')
    expect(snapshots.get('a')!.spectators).toBe(1)
    for (const id of ['a', 'b', 'c']) {
      open(id)
      manager.handle(id, { kind: 'sit', tableId: 'one' })
    }
    expect(events.get('c')?.kind).toBe('error')
    manager.handle('a', { kind: 'ready', tableId: 'one', ready: true })
    expect(snapshots.get('a')!.phase).toBe('waiting')
    manager.handle('b', { kind: 'ready', tableId: 'one', ready: true })
    expect(snapshots.get('a')!).toMatchObject({ phase: 'aiming', deadline: now + 30_000, spectators: 1 })
  })
  it('isolates table broadcasts and synchronizes spectators joining mid-shot', () => {
    start()
    open('other', 'two')
    const other = snapshots.get('other')
    shot()
    now += 50
    manager.tick(50)
    open('watcher')
    expect(snapshots.get('watcher')).toEqual(snapshots.get('a'))
    expect(snapshots.get('watcher')!.phase).toBe('moving')
    expect(snapshots.get('other')).toBe(other)
  })
  it('rejects spectators, wrong turns, non-finite values, and duplicate shots', () => {
    start()
    open('watcher')
    shot('watcher')
    expect(events.get('watcher')?.kind).toBe('error')
    shot('b')
    expect(events.get('b')?.kind).toBe('error')
    const state = snapshots.get('a')!
    manager.handle('a', { kind: 'shoot', tableId: 'one', matchId: state.matchId, turnId: state.turnId, angle: Infinity, power: 1 })
    expect(events.get('a')?.kind).toBe('error')
    shot()
    shot()
    expect(events.get('a')?.kind).toBe('error')
    expect(snapshots.get('a')!.phase).toBe('moving')
  })
  it('expires at thirty seconds and requires legal white placement before shooting', () => {
    start()
    now += 30_000
    manager.tick(10)
    expect(snapshots.get('b')).toMatchObject({ turn: 1, ballInHand: true, cuePlaced: false })
    shot('b')
    expect(events.get('b')?.kind).toBe('error')
    const { matchId, turnId } = snapshots.get('b')!
    manager.handle('b', { kind: 'place', tableId: 'one', matchId, turnId, x: 560, y: 200 })
    expect(events.get('b')?.kind).toBe('error')
    manager.handle('b', { kind: 'place', tableId: 'one', matchId, turnId, x: 300, y: 200 })
    shot('b')
    expect(snapshots.get('b')!.phase).toBe('moving')
  })
  it('rejects an expired shot even before the timer callback runs', () => {
    start()
    now += 30_000
    shot()
    expect(snapshots.get('a')).toMatchObject({ turn: 1, phase: 'aiming' })
    expect(events.get('a')?.kind).toBe('error')
  })
  it('preserves remaining aim time during reconnection and sends a complete snapshot', () => {
    start()
    now += 10_000
    manager.drop('a')
    expect(snapshots.get('b')).toMatchObject({ paused: true, remainingMs: 20_000, deadline: null })
    now += 14_000
    manager.tick(10)
    manager.reconnect('a')
    expect(snapshots.get('a')).toMatchObject({ paused: false, deadline: now + 20_000, turn: 0 })
    expect(snapshots.get('a')!.players[0]?.connected).toBe(true)
  })
  it('finishes moving balls before pausing the next turn for a dropped player', () => {
    start()
    shot()
    manager.drop('a')
    for (let i = 0; i < 1200 && snapshots.get('b')!.phase === 'moving'; i++) {
      now += 20
      manager.tick(20)
    }
    expect(snapshots.get('b')).toMatchObject({ phase: 'aiming', paused: true, deadline: null })
  })
  it('forfeits on leave, permits a replacement, and alternates the next break', () => {
    start()
    manager.leave('a')
    expect(snapshots.get('b')).toMatchObject({ phase: 'finished', winner: 1 })
    open('c')
    manager.handle('c', { kind: 'sit', tableId: 'one' })
    for (const id of ['b', 'c']) manager.handle(id, { kind: 'ready', tableId: 'one', ready: true })
    expect(snapshots.get('b')).toMatchObject({ phase: 'aiming', turn: 1, matchId: 2 })
  })
  it('cancels when both disconnected players expire and cleans up an empty table', () => {
    start()
    open('watcher')
    manager.drop('a')
    manager.drop('b')
    manager.leave('a')
    manager.leave('b')
    expect(snapshots.get('watcher')).toMatchObject({ phase: 'finished', winner: null })
    manager.leave('watcher')
    expect(manager.isAttached('watcher')).toBe(false)
    open('new')
    expect(snapshots.get('new')).toMatchObject({ phase: 'waiting', players: [null, null] })
  })
})

describe('bot tables', () => {
  interface Session { state: PoolSnapshot, bot: unknown }
  const session = () => (manager as unknown as { sessions: Map<string, Session> }).sessions.get('one')!
  function playBot(id = 'a'): void {
    open(id)
    manager.handle(id, { kind: 'playBot', tableId: 'one' })
  }
  function run(ms: number, id = 'a'): void {
    for (let elapsed = 0; elapsed < ms; elapsed += 16) {
      now += 16
      manager.tick(16)
    }
    expect(snapshots.get(id)).toBeDefined()
  }

  it('seats the human first and a ready bot second, and blocks everyone else from sitting', () => {
    playBot()
    expect(snapshots.get('a')!.players[0]).toMatchObject({ sessionId: 'a', ready: false })
    expect(snapshots.get('a')!.players[1]).toMatchObject({ name: 'Bot', ready: true, connected: true })
    open('c')
    manager.handle('c', { kind: 'sit', tableId: 'one' })
    expect(events.get('c')?.kind).toBe('error')
    expect(snapshots.get('c')!.spectators).toBe(1)
  })
  it('refuses the bot on a table that is not empty', () => {
    open('a')
    manager.handle('a', { kind: 'sit', tableId: 'one' })
    playBot('b')
    expect(events.get('b')?.kind).toBe('error')
    expect(snapshots.get('b')!.players[1]).toBeNull()
  })
  it('starts when the human is ready and the human breaks, rematches included', () => {
    playBot()
    manager.handle('a', { kind: 'ready', tableId: 'one', ready: true })
    expect(snapshots.get('a')).toMatchObject({ phase: 'aiming', turn: 0, breaking: true })
    ;(manager as unknown as { finish: (table: Session, winner: number, notice: string) => void }).finish(session(), 0, 'done')
    expect(snapshots.get('a')!.players[1]?.ready).toBe(true)
    manager.handle('a', { kind: 'ready', tableId: 'one', ready: true })
    expect(snapshots.get('a')).toMatchObject({ phase: 'aiming', turn: 0, matchId: 2 })
  })
  it('does not act on the human turn', () => {
    playBot()
    manager.handle('a', { kind: 'ready', tableId: 'one', ready: true })
    const before = snapshots.get('a')!.turnId
    run(5000)
    expect(snapshots.get('a')).toMatchObject({ turnId: before, phase: 'aiming' })
  })
  it('shoots on its own turn after thinking, without a human command', () => {
    playBot()
    manager.handle('a', { kind: 'ready', tableId: 'one', ready: true })
    Object.assign(session().state, { turn: 1, breaking: false })
    const before = session().state.turnId
    run(1000)
    expect(session().state.phase).toBe('aiming')
    run(25_000)
    expect(session().state.turnId).toBeGreaterThan(before)
  })
  it('places the cue ball itself when it has ball in hand', () => {
    playBot()
    manager.handle('a', { kind: 'ready', tableId: 'one', ready: true })
    Object.assign(session().state, { turn: 1, breaking: false, ballInHand: true, cuePlaced: false })
    run(1000)
    expect(session().state.cuePlaced).toBe(false)
    run(2000)
    expect(session().state.cuePlaced).toBe(true)
  })
  it('removes the bot when the human stands up or leaves', () => {
    playBot()
    manager.handle('a', { kind: 'stand', tableId: 'one' })
    expect(snapshots.get('a')!.players).toEqual([null, null])
    manager.handle('a', { kind: 'playBot', tableId: 'one' })
    manager.handle('a', { kind: 'ready', tableId: 'one', ready: true })
    open('w')
    manager.leave('a')
    expect(snapshots.get('w')).toMatchObject({ phase: 'finished', winner: 1, players: [null, null] })
    manager.handle('w', { kind: 'playBot', tableId: 'one' })
    expect(snapshots.get('w')!.players[1]).toMatchObject({ name: 'Bot' })
  })
})

describe('game modes', () => {
  interface Session { state: PoolSnapshot & { balls: { id: number, x: number, y: number, vx: number, vy: number, pocketed: boolean }[] } }
  const session = () => (manager as unknown as { sessions: Map<string, Session> }).sessions.get('one')!
  function setMode(id: string, mode: string): void {
    manager.handle(id, { kind: 'setMode', tableId: 'one', mode })
  }
  function seat(id: string): void {
    open(id)
    manager.handle(id, { kind: 'sit', tableId: 'one' })
  }

  it('starts on 8-ball and lets only the first player to sit change it before the match', () => {
    seat('a')
    seat('b')
    expect(snapshots.get('a')).toMatchObject({ mode: '8-ball', ownerSeat: 0 })
    setMode('b', 'regional')
    expect(events.get('b')?.kind).toBe('error')
    expect(snapshots.get('a')!.mode).toBe('8-ball')
    setMode('a', 'regional')
    expect(snapshots.get('b')!.mode).toBe('regional')
  })
  it('clears ready flags when the mode changes, so nobody starts on rules they did not see', () => {
    seat('a')
    seat('b')
    manager.handle('b', { kind: 'ready', tableId: 'one', ready: true })
    setMode('a', 'regional')
    expect(snapshots.get('a')!.players[1]?.ready).toBe(false)
  })
  it('rejects unknown modes and mode changes during a match, and keeps the mode on rematch', () => {
    seat('a')
    seat('b')
    setMode('a', 'regional')
    setMode('a', 'nonsense')
    expect(events.get('a')?.kind).toBe('error')
    for (const id of ['a', 'b']) manager.handle(id, { kind: 'ready', tableId: 'one', ready: true })
    setMode('a', '8-ball')
    expect(snapshots.get('a')!.mode).toBe('regional')
    ;(manager as unknown as { finish: (table: Session, winner: number, notice: string) => void }).finish(session(), 0, 'done')
    expect(snapshots.get('a')!.mode).toBe('regional')
  })
  it('passes ownership to the remaining player when the owner leaves', () => {
    seat('a')
    seat('b')
    manager.leave('a')
    expect(snapshots.get('b')).toMatchObject({ ownerSeat: 1 })
  })
  it('lets the human pick the mode against the bot', () => {
    open('a')
    manager.handle('a', { kind: 'playBot', tableId: 'one' })
    expect(snapshots.get('a')!.ownerSeat).toBe(0)
    setMode('a', 'regional')
    expect(snapshots.get('a')).toMatchObject({ mode: 'regional' })
    expect(snapshots.get('a')!.players[1]?.ready).toBe(true)
  })

  function wrongFirstContact(mode: string): PoolSnapshot {
    seat('a')
    seat('b')
    setMode('a', mode)
    for (const id of ['a', 'b']) manager.handle(id, { kind: 'ready', tableId: 'one', ready: true })
    const ball = (id: number, x: number, y: number) => ({ id, x, y, vx: 0, vy: 0, pocketed: false })
    Object.assign(session().state, { groups: ['solids', 'stripes'], breaking: false, balls: [ball(0, 200, 200), ball(9, 300, 200), ball(10, 500, 300), ball(1, 600, 100), ball(2, 650, 120)] })
    shot()
    for (let i = 0; i < 1500 && snapshots.get('a')!.phase === 'moving'; i++) {
      now += 20
      manager.tick(20)
    }
    return snapshots.get('a')!
  }
  it('pockets the lowest opponent ball without ball in hand on a Regional wrong first contact', () => {
    const state = wrongFirstContact('regional')
    expect(state).toMatchObject({ turn: 1, ballInHand: false })
    expect(state.balls.find(b => b.id === 9)?.pocketed).toBe(true)
    expect(state.balls.find(b => b.id === 10)?.pocketed).toBe(false)
    expect(state.notice).toContain('ball 9 was pocketed')
    expect(state.notice).toContain('Turn lost')
  })
  it('returns the cue ball to the starting spot and pockets an opponent ball on a Regional scratch', () => {
    seat('a')
    seat('b')
    setMode('a', 'regional')
    for (const id of ['a', 'b']) manager.handle(id, { kind: 'ready', tableId: 'one', ready: true })
    const ball = (id: number, x: number, y: number) => ({ id, x, y, vx: 0, vy: 0, pocketed: false })
    Object.assign(session().state, { groups: ['solids', 'stripes'], breaking: false, balls: [ball(0, 60, 60), ball(1, 600, 300), ball(9, 650, 120), ball(10, 700, 300)] })
    const state = snapshots.get('a')!
    manager.handle('a', { kind: 'shoot', tableId: 'one', matchId: state.matchId, turnId: state.turnId, angle: -3 * Math.PI / 4, power: 0.6 })
    for (let i = 0; i < 1500 && snapshots.get('a')!.phase === 'moving'; i++) {
      now += 20
      manager.tick(20)
    }
    const after = snapshots.get('a')!
    expect(after).toMatchObject({ turn: 1, ballInHand: false, cuePlaced: true })
    expect(after.balls.find(b => b.id === 0)).toMatchObject({ x: 200, y: 200, pocketed: false })
    expect(after.balls.find(b => b.id === 9)?.pocketed).toBe(true)
    expect(after.balls.find(b => b.id === 10)?.pocketed).toBe(false)
    expect(after.notice).toContain('returns to the starting spot')
  })
  it('pockets the next lowest opponent ball after a legal first contact that also pockets an opponent ball', () => {
    seat('a')
    seat('b')
    setMode('a', 'regional')
    for (const id of ['a', 'b']) manager.handle(id, { kind: 'ready', tableId: 'one', ready: true })
    const ball = (id: number, x: number, y: number, vx = 0, vy = 0) => ({ id, x, y, vx, vy, pocketed: false })
    Object.assign(session().state, { groups: ['solids', 'stripes'], breaking: false, balls: [ball(0, 200, 200), ball(1, 400, 200), ball(9, 60, 60, -300, -300), ball(10, 650, 100), ball(11, 700, 350)] })
    shot()
    for (let i = 0; i < 1500 && snapshots.get('a')!.phase === 'moving'; i++) {
      now += 20
      manager.tick(20)
    }
    const after = snapshots.get('a')!
    expect(after).toMatchObject({ turn: 1, ballInHand: false })
    expect(after.balls.find(b => b.id === 9)?.pocketed).toBe(true)
    expect(after.balls.find(b => b.id === 10)?.pocketed).toBe(true)
    expect(after.balls.find(b => b.id === 11)?.pocketed).toBe(false)
    expect(after.notice).toContain('ball 10 was pocketed')
  })
  it('gives ball in hand and pockets nothing on the same 8-ball shot', () => {
    const state = wrongFirstContact('8-ball')
    expect(state).toMatchObject({ turn: 1, ballInHand: true })
    expect(state.balls.find(b => b.id === 9)?.pocketed).toBe(false)
  })
})
