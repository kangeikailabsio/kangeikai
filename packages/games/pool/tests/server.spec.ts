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
