import type { ConnectionState, RoomConnection } from '$lib/network/room-connection'
import type { PoolCommand, PoolEvent, PoolSnapshot } from '@kangeikai/game-pool/protocol'
import { GameSessionState } from '$lib/game/games/game-session-state.svelte'
import { describe, expect, it, vi } from 'vitest'

function setup() {
  const events = new Set<(event: PoolEvent) => void>()
  const statuses = new Set<(status: ConnectionState) => void>()
  const sendPool = vi.fn<(command: PoolCommand) => void>()
  const flushPendingState = vi.fn()
  const connection = {
    sessionId: 'me',
    sendPool,
    flushPendingState,
    onPoolEvent: (listener: (event: PoolEvent) => void) => {
      events.add(listener)
      return () => events.delete(listener)
    },
    onConnectionStateChange: (listener: (status: ConnectionState) => void) => {
      statuses.add(listener)
      return () => statuses.delete(listener)
    },
  } as unknown as RoomConnection
  const session = new GameSessionState()
  const dispose = session.connect(connection)
  const status = (value: ConnectionState) => statuses.forEach(listener => listener(value))
  const event = (value: PoolEvent) => events.forEach(listener => listener(value))
  status('connected')
  return { session, status, event, dispose, events, statuses, sendPool, flushPendingState }
}

describe('game overlay session lifecycle', () => {
  it('flushes final position before opening and waits for close acknowledgment', () => {
    const { session, sendPool, flushPendingState, event } = setup()
    session.openTable('pool')
    expect(session.open).toBe(true)
    expect(flushPendingState.mock.invocationCallOrder[0]).toBeLessThan(sendPool.mock.invocationCallOrder[0])
    session.close()
    expect(session.open).toBe(true)
    expect(sendPool).toHaveBeenLastCalledWith({ kind: 'leave', tableId: 'pool' })
    event({ kind: 'closed', tableId: 'pool' })
    expect(session.open).toBe(false)
  })
  it('remembers a requested exit across a dropped connection', () => {
    const { session, sendPool, status } = setup()
    session.openTable('pool')
    status('connecting')
    session.close()
    status('connected')
    expect(sendPool).toHaveBeenLastCalledWith({ kind: 'leave', tableId: 'pool' })
    status('disconnected')
    expect(session.open).toBe(false)
  })
  it('ignores stale snapshots and removes subscriptions on scene shutdown', () => {
    const { session, event, dispose, events, statuses } = setup()
    session.openTable('pool')
    const latest = { tableId: 'pool', revision: 2 } as PoolSnapshot
    event({ kind: 'snapshot', state: latest })
    event({ kind: 'snapshot', state: { ...latest, revision: 1 } })
    expect(session.snapshot?.revision).toBe(2)
    dispose()
    expect(session.open).toBe(false)
    expect(events.size).toBe(0)
    expect(statuses.size).toBe(0)
  })
  it('unlocks the office when the server rejects opening a table', () => {
    const { session, event } = setup()
    session.openTable('pool')
    event({ kind: 'error', tableId: 'pool', message: 'Aproxime-se.' })
    expect(session.open).toBe(false)
    expect(session.error).toBe('Aproxime-se.')
  })
})
