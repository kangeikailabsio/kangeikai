import type { PoolEvent, PoolSnapshot } from '@kangeikai/game-pool/protocol'
import { poolEventSchema } from '@kangeikai/game-pool/protocol'
import { PoolManager } from '@kangeikai/game-pool/server'
import * as v from 'valibot'
import { describe, expect, it } from 'vitest'

function snapshotsOf(events: PoolEvent[]): PoolSnapshot[] {
  return events.flatMap(event => event.kind === 'snapshot' ? [event.state] : [])
}

/** Every event the server really sends while two people play: join, ready, break, and the balls rolling. */
function realEvents(): PoolEvent[] {
  const events: PoolEvent[] = []
  let now = 1000
  const manager = new PoolManager([{ id: 'one', gameType: 'pool', x: 0, y: 0, width: 100, height: 100 }], {
    now: () => now,
    random: () => 0,
    identity: id => ({ name: id, spriteType: 'woman' as const, x: 50, y: 50, available: true }),
    send: (_id, event) => void events.push(event),
  })
  for (const id of ['a', 'b']) {
    manager.handle(id, { kind: 'open', tableId: 'one' })
    manager.handle(id, { kind: 'sit', tableId: 'one' })
    manager.handle(id, { kind: 'ready', tableId: 'one', ready: true })
  }
  const state = snapshotsOf(events).at(-1)!
  manager.handle('a', { kind: 'aim', tableId: 'one', matchId: state.matchId, turnId: state.turnId, angle: 0.5, power: 0.5, locked: false })
  manager.handle('b', { kind: 'leave', tableId: 'one' })
  manager.handle('a', { kind: 'open', tableId: 'unknown' })
  now += 100
  return events
}

describe('poolEventSchema', () => {
  const events = realEvents()

  it('accepts every kind of event the server really sends', () => {
    expect(new Set(events.map(event => event.kind))).toEqual(new Set(['snapshot', 'error', 'closed']))
    for (const event of events)
      expect(v.safeParse(poolEventSchema, event).issues).toBeUndefined()
  })

  it('accepts the events that need a table in a particular state', () => {
    const state = snapshotsOf(events)[0]
    const aim = { matchId: 1, turnId: 2, angle: 0.3, power: 1, locked: true, placing: { x: 1, y: 2 } }
    for (const event of [
      { kind: 'aim', tableId: 'one', aim },
      { kind: 'aim', tableId: 'one', aim: null },
      { kind: 'kicked', tableId: 'one', reason: 'tampering' },
      { kind: 'error', message: 'nope' },
      { kind: 'snapshot', state: { ...state, winner: 1, deadline: null, groups: ['solids', null] } },
    ])
      expect(v.is(poolEventSchema, event)).toBe(true)
  })

  it('rejects what a broken server could send', () => {
    const state = snapshotsOf(events)[0]
    const bad: unknown[] = [
      undefined,
      null,
      'snapshot',
      {},
      { kind: 'unknown' },
      { kind: 'closed' },
      { kind: 'kicked', tableId: 'one', reason: 'rude' },
      { kind: 'aim', tableId: 'one', aim: { matchId: 1, turnId: 1, angle: Number.NaN, power: 1, locked: true } },
      { kind: 'snapshot' },
      { kind: 'snapshot', state: { ...state, phase: 'sleeping' } },
      { kind: 'snapshot', state: { ...state, notice: undefined } },
      { kind: 'snapshot', state: { ...state, groups: ['solids'] } },
      { kind: 'snapshot', state: { ...state, winner: 2 } },
      { kind: 'snapshot', state: { ...state, balls: [{ ...state.balls[0], x: Number.POSITIVE_INFINITY }] } },
      { kind: 'snapshot', state: { ...state, players: [{ sessionId: 'a' }] } },
    ]
    for (const event of bad)
      expect(v.is(poolEventSchema, event), JSON.stringify(event)).toBe(false)
  })
})
