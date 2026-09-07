import type { Room as SDKRoom } from '@colyseus/sdk'
import type { ColyseusTestServer } from '@colyseus/testing'
import type { Server as HttpServer } from 'node:http'
import { boot } from '@colyseus/testing'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { Server } from 'colyseus'
import express from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { registerLiveKitTokenRoute } from '../../src/http/livekit-token'
import { OfficeRoom } from '../../src/rooms/office-room'
import { AvatarSchema } from '../../src/rooms/schema/avatar-schema'
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

  it('replicates busy presence from join options to other clients', async () => {
    const room = await colyseus.createRoom('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientA = await colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientB = await colyseus.connectTo(room, { displayName: 'Bob', spriteType: 'woman', accessCode: '', presence: 'busy' })

    await waitFor(clientA, () => clientA.state.players.get(clientB.sessionId)?.presence === 'busy')
  })

  it('defaults omitted join presence to available for other clients', async () => {
    const room = await colyseus.createRoom('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientA = await colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientB = await colyseus.connectTo(room, { displayName: 'Bob', spriteType: 'woman', accessCode: '' })

    await waitFor(clientA, () => clientA.state.players.get(clientB.sessionId)?.presence === 'available')
  })

  it('setPresence updates only the sender avatar', async () => {
    const room = await colyseus.createRoom('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientA = await colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientB = await colyseus.connectTo(room, { displayName: 'Bob', spriteType: 'woman', accessCode: '' })
    await waitFor(clientA, () => clientA.state.players.has(clientB.sessionId))
    await waitFor(clientB, () => Boolean(clientB.state.players?.has(clientA.sessionId)))

    clientA.send('setPresence', { presence: 'busy' })
    await waitFor(clientB, () => clientB.state.players.get(clientA.sessionId)?.presence === 'busy')

    expect(clientB.state.players.get(clientB.sessionId)?.presence).toBe('available')
  })

  it('ignores updateState at spawn while presence is busy', async () => {
    const room = await colyseus.createRoom('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientA = await colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientB = await colyseus.connectTo(room, { displayName: 'Bob', spriteType: 'woman', accessCode: '', presence: 'busy' })
    await waitFor(clientA, () => clientA.state.players.get(clientB.sessionId)?.presence === 'busy')

    clientB.send('updateState', { x: 42, y: 84, direction: 'right', motionState: 'walking' })
    clientA.send('updateState', { x: 10, y: 20, direction: 'up', motionState: 'walking' })
    await waitFor(clientA, () => clientA.state.players.get(clientA.sessionId)?.x === 10)

    const busy = clientA.state.players.get(clientB.sessionId)
    expect(busy?.x).toBe(150)
    expect(busy?.y).toBe(150)
    expect(busy?.direction).toBe('down')
    expect(busy?.motionState).toBe('idle')
  })

  it('ignores updateState while busy and keeps the last applied pose', async () => {
    const room = await colyseus.createRoom('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientA = await colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientB = await colyseus.connectTo(room, { displayName: 'Bob', spriteType: 'woman', accessCode: '' })
    await waitFor(clientA, () => clientA.state.players.has(clientB.sessionId))
    await waitFor(clientB, () => Boolean(clientB.state.players?.has(clientA.sessionId)))

    clientA.send('updateState', { x: 42, y: 84, direction: 'right', motionState: 'walking' })
    await waitFor(clientB, () => clientB.state.players.get(clientA.sessionId)?.x === 42)

    clientA.send('setPresence', { presence: 'busy' })
    await waitFor(clientB, () => clientB.state.players.get(clientA.sessionId)?.presence === 'busy')

    clientA.send('updateState', { x: 99, y: 99, direction: 'left', motionState: 'sprinting' })
    clientB.send('updateState', { x: 10, y: 20, direction: 'up', motionState: 'walking' })
    await waitFor(clientB, () => clientB.state.players.get(clientB.sessionId)?.x === 10)

    const frozen = clientB.state.players.get(clientA.sessionId)
    expect(frozen?.x).toBe(42)
    expect(frozen?.y).toBe(84)
    expect(frozen?.direction).toBe('right')
    expect(frozen?.motionState).toBe('walking')
  })

  it('applies updateState again after presence returns to available', async () => {
    const room = await colyseus.createRoom('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientA = await colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientB = await colyseus.connectTo(room, { displayName: 'Bob', spriteType: 'woman', accessCode: '' })
    await waitFor(clientA, () => clientA.state.players.has(clientB.sessionId))
    await waitFor(clientB, () => Boolean(clientB.state.players?.has(clientA.sessionId)))

    clientA.send('setPresence', { presence: 'busy' })
    await waitFor(clientB, () => clientB.state.players.get(clientA.sessionId)?.presence === 'busy')

    clientA.send('setPresence', { presence: 'available' })
    await waitFor(clientB, () => clientB.state.players.get(clientA.sessionId)?.presence === 'available')

    clientA.send('updateState', { x: 42, y: 84, direction: 'right', motionState: 'walking' })
    await waitFor(clientB, () => clientB.state.players.get(clientA.sessionId)?.x === 42)

    const moved = clientB.state.players.get(clientA.sessionId)
    expect(moved?.y).toBe(84)
    expect(moved?.direction).toBe('right')
    expect(moved?.motionState).toBe('walking')
  })

  it('preserves busy presence on the same session after reconnection within the grace period', async () => {
    const room = await colyseus.createRoom('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientA = await colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const clientB = await colyseus.connectTo(room, { displayName: 'Bob', spriteType: 'woman', accessCode: '' })
    await waitFor(clientA, () => clientA.state.players.has(clientB.sessionId))
    await waitFor(clientB, () => Boolean(clientB.state.players?.has(clientA.sessionId)))

    clientB.send('setPresence', { presence: 'busy' })
    await waitFor(clientA, () => clientA.state.players.get(clientB.sessionId)?.presence === 'busy')

    const { sessionId, reconnectionToken } = clientB
    await clientB.leave(false)
    await waitFor(clientA, () => !clientA.state.players.has(sessionId))

    const reconnectedB = await colyseus.sdk.reconnect(reconnectionToken)
    expect(reconnectedB.sessionId).toBe(sessionId)
    await waitFor(clientA, () => clientA.state.players.has(sessionId))
    expect(clientA.state.players.get(sessionId)?.presence).toBe('busy')
  })

  it('sends a sessionProof on join that verifies against the client\'s own sessionId', async () => {
    const room = await colyseus.createRoom('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })
    const client = await colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man', accessCode: '' })

    const proof = await new Promise<string>((resolve) => {
      client.onMessage<{ proof: string }>('sessionProof', payload => resolve(payload.proof))
    })

    expect(proof).toBe(computeSessionProof(client.sessionId))
  })

  describe('isPositionInZone (issue #60/TASK #122)', () => {
    // Zone id 2 ("desk-01") on the current map (packages/shared/assets/maps/welcome/map.tmj):
    // x 322.333-416, y 337-447.75. Uses `colyseus.createRoom` only, not `connectTo` — this
    // doesn't need a real client connection, just a live room instance whose state this test
    // populates directly, matching how `/livekit-token` queries it via `matchMaker.remoteRoomCall`
    // without one either.
    const REAL_ZONE_ID = 2
    const INSIDE_REAL_ZONE = { x: 350, y: 370 }
    const OUTSIDE_EVERY_ZONE = { x: 0, y: 0 }

    it('is true for a session whose synced position is inside the requested zone', async () => {
      const room = await colyseus.createRoom<OfficeRoom>('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })
      const avatar = new AvatarSchema()
      avatar.x = INSIDE_REAL_ZONE.x
      avatar.y = INSIDE_REAL_ZONE.y
      room.state.players.set('session-a', avatar)

      expect(room.isPositionInZone('session-a', REAL_ZONE_ID)).toBe(true)
    })

    it('is false for a session positioned outside every zone', async () => {
      const room = await colyseus.createRoom<OfficeRoom>('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })
      const avatar = new AvatarSchema()
      avatar.x = OUTSIDE_EVERY_ZONE.x
      avatar.y = OUTSIDE_EVERY_ZONE.y
      room.state.players.set('session-a', avatar)

      expect(room.isPositionInZone('session-a', REAL_ZONE_ID)).toBe(false)
    })

    it('is false for a session inside a different zone than the one requested', async () => {
      const room = await colyseus.createRoom<OfficeRoom>('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })
      const avatar = new AvatarSchema()
      avatar.x = INSIDE_REAL_ZONE.x
      avatar.y = INSIDE_REAL_ZONE.y
      room.state.players.set('session-a', avatar)

      expect(room.isPositionInZone('session-a', REAL_ZONE_ID + 1000)).toBe(false)
    })

    it('is false for an unknown sessionId', async () => {
      const room = await colyseus.createRoom<OfficeRoom>('office', { displayName: 'Alice', spriteType: 'man', accessCode: '' })

      expect(room.isPositionInZone('no-such-session', REAL_ZONE_ID)).toBe(false)
    })
  })

  /**
   * `/livekit-token`'s position check (issue #60/TASK #122) reaches this file's already-booted
   * `office` room via `matchMaker.remoteRoomCall` — exercised here, not in
   * `livekit-token.spec.ts`, because that file's harness never boots a real Colyseus server
   * (`@colyseus/testing`'s `boot()` binds a fixed port; running two in the same `vitest run`
   * collides). The HTTP route itself is still the real, unmodified one — just a bare Express app
   * registered locally, reusing this file's live `office` room to back the position check.
   */
  describe('post /livekit-token position check (issue #60/TASK #122)', () => {
    let server: HttpServer
    let baseUrl: string

    beforeAll(async () => {
      const app = express()
      registerLiveKitTokenRoute(app)
      await new Promise<void>((resolve) => {
        server = app.listen(0, () => resolve())
      })
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      baseUrl = `http://localhost:${port}`
    })

    beforeEach(() => {
      process.env.LIVEKIT_URL = 'ws://localhost:7880'
      process.env.LIVEKIT_API_KEY = 'test-key'
      process.env.LIVEKIT_API_SECRET = 'test-secret-key-that-is-long-enough'
    })

    afterEach(() => {
      delete process.env.LIVEKIT_URL
      delete process.env.LIVEKIT_API_KEY
      delete process.env.LIVEKIT_API_SECRET
    })

    afterAll(async () => {
      await new Promise<void>(resolve => server.close(() => resolve()))
    })

    function postToken(body: unknown): Promise<Response> {
      return fetch(`${baseUrl}/livekit-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    }

    async function syncPosition(sessionId: string, x: number, y: number): Promise<void> {
      const room = await colyseus.createRoom<OfficeRoom>('office', { displayName: 'Guest', spriteType: 'man', accessCode: '' })
      const avatar = new AvatarSchema()
      avatar.x = x
      avatar.y = y
      room.state.players.set(sessionId, avatar)
    }

    it('mints a token scoped to a private zone room the requester is actually inside (200)', async () => {
      const proof = computeSessionProof('session-a')
      // id 2 ("desk-01") on the current map (packages/shared/assets/maps/welcome/map.tmj's
      // `spaces` layer): x 322.333-416, y 337-447.75.
      await syncPosition('session-a', 350, 370)
      const response = await postToken({ identity: 'session-a', name: 'Guest', proof, room: 'private-2' })
      expect(response.status).toBe(200)

      const body = await response.json() as { token: string, url: string }
      expect(body.token).toEqual(expect.any(String))
    })

    it('rejects a real private zone when the requester\'s synced position is outside it (403)', async () => {
      const proof = computeSessionProof('session-a')
      await syncPosition('session-a', 0, 0) // outside every zone on the current map
      const response = await postToken({ identity: 'session-a', name: 'Guest', proof, room: 'private-2' })
      expect(response.status).toBe(403)
    })
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
