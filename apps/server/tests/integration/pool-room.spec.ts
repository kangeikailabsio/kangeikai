import type { Room as ClientRoom } from '@colyseus/sdk'
import type { ColyseusTestServer } from '@colyseus/testing'
import type { PoolEvent, PoolSnapshot } from '@kangeikai/game-pool/protocol'
import { OfficeRoom } from '$lib/rooms/office-room'
import { boot } from '@colyseus/testing'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { POOL_COMMAND, POOL_EVENT } from '@kangeikai/game-pool/protocol'
import { Server } from 'colyseus'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

let server: ColyseusTestServer

beforeAll(async () => {
  const app = new Server({ transport: new WebSocketTransport() })
  app.define('office', OfficeRoom)
  server = await boot(app)
})
beforeEach(() => {
  process.env.SESSION_SIGNING_SECRET = 'pool-test-secret'
})
afterEach(async () => {
  await server.cleanup()
  delete process.env.SESSION_SIGNING_SECRET
})
afterAll(async () => {
  await server.shutdown()
})

function listen(client: ClientRoom) {
  let latest: PoolSnapshot | undefined
  const listeners = new Set<(event: PoolEvent) => void>()
  client.onMessage(POOL_EVENT, (event: PoolEvent) => {
    if (event.kind === 'snapshot')
      latest = event.state
    listeners.forEach(listener => listener(event))
  })
  return {
    get state() { return latest },
    wait: (predicate: (event: PoolEvent) => boolean) => new Promise<PoolEvent>((resolve, reject) => {
      const timeout = setTimeout(() => {
        listeners.delete(onEvent)
        reject(new Error('Pool event timed out'))
      }, 3000)
      function onEvent(event: PoolEvent) {
        if (predicate(event)) {
          clearTimeout(timeout)
          listeners.delete(onEvent)
          resolve(event)
        }
      }
      listeners.add(onEvent)
    }),
  }
}

async function fixture() {
  const room = await server.createRoom<OfficeRoom>('office', {})
  const clients = await Promise.all(['Alice', 'Bob', 'Carol'].map(displayName => server.connectTo(room, { displayName, spriteType: 'man', accessCode: '' })))
  const views = clients.map(listen)
  clients.forEach((client) => {
    const avatar = room.state.players.get(client.sessionId)!
    avatar.x = 250
    avatar.y = 1510
  })
  async function command(index: number, input: Record<string, unknown>, predicate: (event: PoolEvent) => boolean = event => event.kind === 'snapshot') {
    const event = views[index].wait(predicate)
    clients[index].send(POOL_COMMAND, { tableId: 'pool', ...input })
    return event
  }
  async function start() {
    for (const index of [0, 1]) {
      await command(index, { kind: 'open' })
      await command(index, { kind: 'sit' })
      await command(index, { kind: 'ready', ready: true })
    }
  }
  return { room, clients, views, command, start }
}

describe('pool over OfficeRoom websocket transport', () => {
  it('starts two players and gives a joining spectator the live authoritative state', async () => {
    const { views, command, start } = await fixture()
    await start()
    const state = views[1].state!
    expect(state.phase).toBe('aiming')
    const index = state.turn
    await command(index, { kind: 'shoot', matchId: state.matchId, turnId: state.turnId, angle: 0, power: 1 }, e => e.kind === 'snapshot' && e.state.phase === 'moving')
    await command(2, { kind: 'open' })
    expect(views[2].state).toMatchObject({ phase: 'moving', spectators: 1, matchId: state.matchId })
    expect(views[2].state!.players.map(p => p?.name)).toEqual(['Alice', 'Bob'])
    const denied = await command(2, { kind: 'shoot', matchId: state.matchId, turnId: state.turnId, angle: 0, power: 1 }, e => e.kind === 'error')
    expect(denied.kind).toBe('error')
  })

  it('blocks map movement while attached and releases the avatar on close', async () => {
    const { room, clients, command } = await fixture()
    await command(0, { kind: 'open' })
    const id = clients[0].sessionId
    clients[0].send('updateState', { x: 900, y: 900, direction: 'down', motionState: 'walking' })
    // A following command/response is a transport barrier after the movement message.
    await command(0, { kind: 'sit' })
    expect(room.state.players.get(id)).toMatchObject({ x: 250, y: 1510, motionState: 'idle' })
    await command(0, { kind: 'leave' }, e => e.kind === 'closed')
    clients[0].send('updateState', { x: 900, y: 900, direction: 'down', motionState: 'walking' })
    await command(0, { kind: 'open' }, e => e.kind === 'error')
    expect(room.state.players.get(id)).toMatchObject({ x: 900, y: 900 })
  })

  it('isolates physical tables and reports a forfeit on consented office leave', async () => {
    const { room, clients, views, command, start } = await fixture()
    await start()
    const avatar = room.state.players.get(clients[2].sessionId)!
    avatar.x = 250
    avatar.y = 1400
    await command(2, { kind: 'open', tableId: 'pool-2' })
    expect(views[2].state).toMatchObject({ tableId: 'pool-2', phase: 'waiting', players: [null, null] })
    const result = views[1].wait(e => e.kind === 'snapshot' && e.state.phase === 'finished')
    await clients[0].leave()
    expect(await result).toMatchObject({ kind: 'snapshot', state: { winner: 1 } })
    expect(views[2].state!.phase).toBe('waiting')
  })
})
