import type { Room as SDKRoom } from '@colyseus/sdk'
import type { ColyseusTestServer } from '@colyseus/testing'
import { boot } from '@colyseus/testing'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { Server } from 'colyseus'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { OfficeRoom } from '../../src/rooms/office-room'
import { computeSessionProof } from '../../src/session-proof'

let colyseus: ColyseusTestServer

beforeAll(async () => {
  const server = new Server({ transport: new WebSocketTransport() })
  server.define('office', OfficeRoom)
  colyseus = await boot(server)
})

beforeEach(() => {
  process.env.SESSION_SIGNING_SECRET = 'test-secret'
})

afterEach(async () => {
  delete process.env.SESSION_SIGNING_SECRET
  await colyseus.cleanup()
})

afterAll(async () => {
  await colyseus.shutdown()
})

/**
 * @colyseus/testing@0.17.11's built-in `waitForNextPatch()` is broken against the installed
 * @colyseus/sdk@0.17.43 (it monkey-patches a `Room.prototype.patch` method that no longer
 * exists in that SDK version, so the returned promise never resolves) — use the client room's
 * own public `onStateChange` signal instead.
 */
function nextStateChange(client: SDKRoom): Promise<void> {
  return new Promise(resolve => client.onStateChange.once(() => resolve()))
}

/**
 * Waits for `predicate` to hold, re-checking on every subsequent patch rather than assuming
 * the very next patch is the relevant one — join/leave can arrive alongside unrelated patches
 * (e.g. a client's own initial full-state sync), so a single `onStateChange.once()` can resolve
 * before the awaited change has actually landed.
 */
function waitFor(client: SDKRoom, predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  if (predicate()) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.onStateChange.remove(handleChange)
      reject(new Error('Timed out waiting for room state condition'))
    }, timeoutMs)

    function handleChange(): void {
      if (predicate()) {
        clearTimeout(timeout)
        client.onStateChange.remove(handleChange)
        resolve()
      }
    }

    client.onStateChange(handleChange)
  })
}

describe('officeRoom', () => {
  it('propagates identity and movement state between two connected clients', async () => {
    const room = await colyseus.createRoom('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientA = await colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientB = await colyseus.connectTo(room, { displayName: 'Bob', spriteType: 'woman', accessCode: '' })

    // let clientB's initial full-state sync (both avatars already present) settle before
    // watching for the delta patch clientA's update below is expected to trigger
    await nextStateChange(clientB)

    const nextChange = nextStateChange(clientB)
    clientA.send('updateState', { x: 42, y: 84, direction: 'right', motionState: 'walking' })
    await nextChange

    const aFromB = clientB.state.players.get(clientA.sessionId)
    expect(aFromB?.displayName).toBe('Alice')
    expect(aFromB?.x).toBe(42)
    expect(aFromB?.y).toBe(84)
    expect(aFromB?.direction).toBe('right')
    expect(aFromB?.motionState).toBe('walking')
  })

  it('broadcasts a new avatar on join and removes it on a clean leave', async () => {
    const room = await colyseus.createRoom('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientA = await colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man', accessCode: '' })

    const clientB = await colyseus.connectTo(room, { displayName: 'Bob', spriteType: 'woman', accessCode: '' })
    await waitFor(clientA, () => clientA.state.players.has(clientB.sessionId))

    await clientB.leave()
    await waitFor(clientA, () => !clientA.state.players.has(clientB.sessionId))
  })

  it('hides an ungracefully-disconnected participant during the grace period and resumes the same session on reconnection', async () => {
    const room = await colyseus.createRoom('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientA = await colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientB = await colyseus.connectTo(room, { displayName: 'Bob', spriteType: 'woman', accessCode: '' })
    await waitFor(clientA, () => clientA.state.players.has(clientB.sessionId))

    const { sessionId, reconnectionToken } = clientB
    // `leave(false)` closes the socket directly rather than sending the LEAVE_ROOM protocol
    // message, simulating an ungraceful disconnect (a clean `leave()` sends CONSENTED instead).
    await clientB.leave(false)
    await waitFor(clientA, () => !clientA.state.players.has(sessionId))

    const reconnectedB = await colyseus.sdk.reconnect(reconnectionToken)
    expect(reconnectedB.sessionId).toBe(sessionId)
    await waitFor(clientA, () => clientA.state.players.has(sessionId))
    expect(clientA.state.players.get(sessionId)?.displayName).toBe('Bob')
  })

  it('sends a sessionProof on join that verifies against the client\'s own sessionId', async () => {
    const room = await colyseus.createRoom('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const client = await colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man', accessCode: '' })

    const proof = await new Promise<string>((resolve) => {
      client.onMessage<{ proof: string }>('sessionProof', payload => resolve(payload.proof))
    })

    expect(proof).toBe(computeSessionProof(client.sessionId))
  })

  describe('access code gate (onAuth)', () => {
    afterEach(() => {
      delete process.env.ACCESS_CODE
    })

    it('allows any accessCode (including empty) when ACCESS_CODE is not set', async () => {
      const room = await colyseus.createRoom('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })
      await expect(colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man', accessCode: 'anything' })).resolves.toBeDefined()
    })

    it('rejects a join with the wrong accessCode when ACCESS_CODE is set', async () => {
      process.env.ACCESS_CODE = 'letmein'
      const room = await colyseus.createRoom('office', { displayName: 'Alice', spriteType: 'man', accessCode: 'letmein' })
      await expect(colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man', accessCode: 'wrong' })).rejects.toThrow()
    })

    it('rejects a join with a missing accessCode when ACCESS_CODE is set', async () => {
      process.env.ACCESS_CODE = 'letmein'
      const room = await colyseus.createRoom('office', { displayName: 'Alice', spriteType: 'man', accessCode: 'letmein' })
      await expect(colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man' })).rejects.toThrow()
    })

    it('allows a join with the correct accessCode when ACCESS_CODE is set', async () => {
      process.env.ACCESS_CODE = 'letmein'
      const room = await colyseus.createRoom('office', { displayName: 'Alice', spriteType: 'man', accessCode: 'letmein' })
      await expect(colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man', accessCode: 'letmein' })).resolves.toBeDefined()
    })
  })
})
