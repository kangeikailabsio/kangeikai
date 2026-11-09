import type { Room as SDKRoom } from '@colyseus/sdk'
import type { ColyseusTestServer } from '@colyseus/testing'
import type { Server as HttpServer } from 'node:http'
import { boot } from '@colyseus/testing'
import { WebSocketTransport } from '@colyseus/ws-transport'
import { CLOSE_CODE_SESSION_REPLACED } from '@kangeikai/shared'
import { Server } from 'colyseus'
import express from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { registerLiveKitTokenRoute } from '../../src/http/livekit-token'
import { respawnAreas } from '../../src/map-zones'
import { OfficeRoom, setOfficeRoomAuthenticator } from '../../src/rooms/office-room'
import { AvatarSchema } from '../../src/rooms/schema/avatar-schema'
import { computeSessionProof } from '../../src/session-proof'
import { fakeAuthenticator, INVALID_TICKET, joinAs } from './support/fake-auth'

let colyseus: ColyseusTestServer

beforeAll(async () => {
  setOfficeRoomAuthenticator(fakeAuthenticator)
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
  setOfficeRoomAuthenticator(null)
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

/**
 * A position a person who is standing at `avatar` can move to: the same place, rounded to whole
 * pixels so it survives the state sync exactly. The server only takes positions it can reach from
 * the last one (issue #255), so tests move from the real spawn instead of jumping to made-up points.
 */
function nearby(avatar: { x: number, y: number }): { x: number, y: number } {
  return { x: Math.round(avatar.x), y: Math.round(avatar.y) }
}

describe('officeRoom', () => {
  it('propagates identity and movement state between two connected clients', async () => {
    const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
    const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man'))
    const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman'))

    // let clientB's initial full-state sync (both avatars already present) settle before
    // watching for the delta patch clientA's update below is expected to trigger
    await nextStateChange(clientB)

    // Joining can produce another unrelated patch before the movement is processed.
    const target = nearby(room.state.players.get(clientA.sessionId)!)
    const nextChange = waitFor(clientB, () => clientB.state.players.get(clientA.sessionId)?.direction === 'right')
    clientA.send('updateState', { ...target, direction: 'right', motionState: 'walking' })
    await nextChange

    const aFromB = clientB.state.players.get(clientA.sessionId)
    expect(aFromB?.displayName).toBe('Alice')
    expect(aFromB?.x).toBe(target.x)
    expect(aFromB?.y).toBe(target.y)
    expect(aFromB?.direction).toBe('right')
    expect(aFromB?.motionState).toBe('walking')
  })

  it('propagates a character selection to other clients on join (issue #171)', async () => {
    const characterSelection = {
      body: 3,
      eyes: 5,
      outfit: { style: 3, variant: 4 },
      hairstyle: { style: 8, variant: 3 },
      accessory: null,
    }

    const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
    const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man', { characterSelection }))
    const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman'))

    // clientB's initial full-state sync (its own avatar's `.players` map populated at all) needs
    // its own await first — same reason the "propagates identity and movement" test above does
    // this before touching a just-connected client's `state.players`.
    await nextStateChange(clientB)
    await waitFor(clientB, () => clientB.state.players.has(clientA.sessionId))

    const aFromB = clientB.state.players.get(clientA.sessionId)
    expect(aFromB?.characterSelection).toBe(JSON.stringify(characterSelection))
  })

  it('defaults characterSelection to an empty string for an account with no Character Creator selection', async () => {
    const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
    const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man'))

    await nextStateChange(clientA)
    expect(clientA.state.players.get(clientA.sessionId)?.characterSelection).toBe('')
  })

  it('broadcasts a new avatar on join and removes it on a clean leave', async () => {
    const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
    const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man'))

    const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman'))
    await waitFor(clientA, () => clientA.state.players.has(clientB.sessionId))

    await clientB.leave()
    await waitFor(clientA, () => !clientA.state.players.has(clientB.sessionId))
  })

  it('hides an ungracefully-disconnected participant during the grace period and resumes the same session on reconnection', async () => {
    const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
    const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man'))
    const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman'))
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
    const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
    const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man'))
    const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman', { presence: 'busy' }))

    await waitFor(clientA, () => clientA.state.players.get(clientB.sessionId)?.presence === 'busy')
  })

  it('defaults omitted join presence to available for other clients', async () => {
    const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
    const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man'))
    const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman'))

    await waitFor(clientA, () => clientA.state.players.get(clientB.sessionId)?.presence === 'available')
  })

  it('setPresence updates only the sender avatar', async () => {
    const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
    const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man'))
    const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman'))
    await waitFor(clientA, () => clientA.state.players.has(clientB.sessionId))
    await waitFor(clientB, () => Boolean(clientB.state.players?.has(clientA.sessionId)))

    clientA.send('setPresence', { presence: 'busy' })
    await waitFor(clientB, () => clientB.state.players.get(clientA.sessionId)?.presence === 'busy')

    expect(clientB.state.players.get(clientB.sessionId)?.presence).toBe('available')
  })

  it('ignores updateState at spawn while presence is busy', async () => {
    const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
    const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man'))
    const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman', { presence: 'busy' }))
    await waitFor(clientA, () => clientA.state.players.get(clientB.sessionId)?.presence === 'busy')
    const spawn = { x: room.state.players.get(clientB.sessionId)!.x, y: room.state.players.get(clientB.sessionId)!.y }

    const movedA = nearby(room.state.players.get(clientA.sessionId)!)
    clientB.send('updateState', { ...spawn, direction: 'right', motionState: 'walking' })
    clientA.send('updateState', { ...movedA, direction: 'up', motionState: 'walking' })
    await waitFor(clientA, () => clientA.state.players.get(clientA.sessionId)?.direction === 'up')

    const busy = clientA.state.players.get(clientB.sessionId)
    expect(busy?.x).toBeCloseTo(spawn.x, 2)
    expect(busy?.y).toBeCloseTo(spawn.y, 2)
    expect(busy?.direction).toBe('down')
    expect(busy?.motionState).toBe('idle')
  })

  it('ignores updateState while busy and keeps the last applied pose', async () => {
    const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
    const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man'))
    const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman'))
    await waitFor(clientA, () => clientA.state.players.has(clientB.sessionId))
    await waitFor(clientB, () => Boolean(clientB.state.players?.has(clientA.sessionId)))

    const posA = nearby(room.state.players.get(clientA.sessionId)!)
    const posB = nearby(room.state.players.get(clientB.sessionId)!)
    clientA.send('updateState', { ...posA, direction: 'right', motionState: 'walking' })
    await waitFor(clientB, () => clientB.state.players.get(clientA.sessionId)?.direction === 'right')

    clientA.send('setPresence', { presence: 'busy' })
    await waitFor(clientB, () => clientB.state.players.get(clientA.sessionId)?.presence === 'busy')

    clientA.send('updateState', { ...posA, direction: 'left', motionState: 'sprinting' })
    clientB.send('updateState', { ...posB, direction: 'up', motionState: 'walking' })
    await waitFor(clientB, () => clientB.state.players.get(clientB.sessionId)?.direction === 'up')

    const frozen = clientB.state.players.get(clientA.sessionId)
    expect(frozen?.x).toBe(posA.x)
    expect(frozen?.y).toBe(posA.y)
    expect(frozen?.direction).toBe('right')
    expect(frozen?.motionState).toBe('walking')
  })

  it('applies updateState again after presence returns to available', async () => {
    const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
    const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man'))
    const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman'))
    await waitFor(clientA, () => clientA.state.players.has(clientB.sessionId))
    await waitFor(clientB, () => Boolean(clientB.state.players?.has(clientA.sessionId)))

    clientA.send('setPresence', { presence: 'busy' })
    await waitFor(clientB, () => clientB.state.players.get(clientA.sessionId)?.presence === 'busy')

    clientA.send('setPresence', { presence: 'available' })
    await waitFor(clientB, () => clientB.state.players.get(clientA.sessionId)?.presence === 'available')

    const target = nearby(room.state.players.get(clientA.sessionId)!)
    clientA.send('updateState', { ...target, direction: 'right', motionState: 'walking' })
    await waitFor(clientB, () => clientB.state.players.get(clientA.sessionId)?.direction === 'right')

    const moved = clientB.state.players.get(clientA.sessionId)
    expect(moved?.x).toBe(target.x)
    expect(moved?.y).toBe(target.y)
    expect(moved?.direction).toBe('right')
    expect(moved?.motionState).toBe('walking')
  })

  it('preserves busy presence on the same session after reconnection within the grace period', async () => {
    const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
    const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man'))
    const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman'))
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
    const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
    const client = await colyseus.connectTo(room, joinAs('Alice', 'man'))

    const proof = await new Promise<string>((resolve) => {
      client.onMessage<{ proof: string }>('sessionProof', payload => resolve(payload.proof))
    })

    expect(proof).toBe(computeSessionProof(client.sessionId))
  })

  describe('spawn point (issue #254)', () => {
    function insideARespawnArea(point: { x: number, y: number }): boolean {
      return respawnAreas.some(area => point.x >= area.x && point.x <= area.x + area.width && point.y >= area.y && point.y <= area.y + area.height)
    }

    it('places a joining avatar inside a respawn area of the map', async () => {
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
      const client = await colyseus.connectTo(room, joinAs('Alice', 'man'))

      const avatar = room.state.players.get(client.sessionId)
      expect(avatar).toBeDefined()
      expect(insideARespawnArea({ x: avatar!.x, y: avatar!.y })).toBe(true)
    })

    it('tells the joining client where it was placed', async () => {
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
      const client = await colyseus.connectTo(room, joinAs('Alice', 'man'))

      const spawn = await new Promise<{ x: number, y: number }>((resolve) => {
        client.onMessage<{ x: number, y: number }>('spawn', payload => resolve(payload))
      })

      const avatar = room.state.players.get(client.sessionId)
      expect(spawn).toEqual({ x: avatar!.x, y: avatar!.y })
    })
  })

  describe('movement validation (issue #255)', () => {
    function correctionOf(client: SDKRoom): Promise<{ x: number, y: number }> {
      return new Promise(resolve => client.onMessage<{ x: number, y: number }>('correctPosition', payload => resolve(payload)))
    }

    it('keeps a teleport out of the state and sends the sender back to its last valid position', async () => {
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
      const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man'))
      const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman'))
      const avatarA = room.state.players.get(clientA.sessionId)!
      const before = { x: avatarA.x, y: avatarA.y }
      const correction = correctionOf(clientA)

      clientA.send('updateState', { x: 1500, y: 800, direction: 'up', motionState: 'sprinting' })

      expect(await correction).toEqual({ x: before.x, y: before.y })
      expect(avatarA.x).toBe(before.x)
      expect(avatarA.y).toBe(before.y)
      expect(avatarA.direction).toBe('down')
      expect(clientB.state.players.get(clientA.sessionId)?.direction).toBe('down')
    })

    it('refuses a position inside a wall even when it is close', async () => {
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
      const client = await colyseus.connectTo(room, joinAs('Alice', 'man'))
      const avatar = room.state.players.get(client.sessionId)!
      const correction = correctionOf(client)

      // Standing next to the wall along the left edge of the map (x ~ 1.3 to 33.3), then stepping into it.
      avatar.x = 60
      avatar.y = 1000
      client.send('updateState', { x: 55, y: 1000, direction: 'left', motionState: 'walking' })
      client.send('updateState', { x: 10, y: 1000, direction: 'left', motionState: 'walking' })

      expect(await correction).toEqual({ x: 55, y: 1000 })
      expect(avatar.x).toBe(55)
    })

    it('keeps a person from claiming a private zone they did not walk to', async () => {
      const room = await colyseus.createRoom<OfficeRoom>('office', joinAs('Alice', 'man'))
      const client = await colyseus.connectTo(room, joinAs('Alice', 'man'))
      const correction = correctionOf(client)

      client.send('updateState', { x: 350, y: 370, direction: 'down', motionState: 'walking' })
      await correction

      expect(room.isPositionInZone(client.sessionId, 2)).toBe(false)
    })

    it('accepts a real walk of many small steps', async () => {
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
      const client = await colyseus.connectTo(room, joinAs('Alice', 'man'))
      const start = nearby(room.state.players.get(client.sessionId)!)

      for (let step = 1; step <= 5; step++)
        client.send('updateState', { x: start.x + step, y: start.y, direction: 'right', motionState: 'walking' })
      await waitFor(client, () => room.state.players.get(client.sessionId)?.x === start.x + 5)

      expect(room.state.players.get(client.sessionId)?.x).toBe(start.x + 5)
    })
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
      const room = await colyseus.createRoom<OfficeRoom>('office', joinAs('Alice', 'man'))
      const avatar = new AvatarSchema()
      avatar.x = INSIDE_REAL_ZONE.x
      avatar.y = INSIDE_REAL_ZONE.y
      room.state.players.set('session-a', avatar)

      expect(room.isPositionInZone('session-a', REAL_ZONE_ID)).toBe(true)
    })

    it('is false for a session positioned outside every zone', async () => {
      const room = await colyseus.createRoom<OfficeRoom>('office', joinAs('Alice', 'man'))
      const avatar = new AvatarSchema()
      avatar.x = OUTSIDE_EVERY_ZONE.x
      avatar.y = OUTSIDE_EVERY_ZONE.y
      room.state.players.set('session-a', avatar)

      expect(room.isPositionInZone('session-a', REAL_ZONE_ID)).toBe(false)
    })

    it('is false for a session inside a different zone than the one requested', async () => {
      const room = await colyseus.createRoom<OfficeRoom>('office', joinAs('Alice', 'man'))
      const avatar = new AvatarSchema()
      avatar.x = INSIDE_REAL_ZONE.x
      avatar.y = INSIDE_REAL_ZONE.y
      room.state.players.set('session-a', avatar)

      expect(room.isPositionInZone('session-a', REAL_ZONE_ID + 1000)).toBe(false)
    })

    it('is false for an unknown sessionId', async () => {
      const room = await colyseus.createRoom<OfficeRoom>('office', joinAs('Alice', 'man'))

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
      const room = await colyseus.createRoom<OfficeRoom>('office', joinAs('Guest', 'man'))
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

  describe('interaction / "Say Hello" (issue #157)', () => {
    it('relays a hello to the target with the sender\'s displayName', async () => {
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
      const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man'))
      const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman'))
      await waitFor(clientA, () => clientA.state.players.has(clientB.sessionId))

      const received = new Promise<{ kind: string, fromSessionId: string, fromDisplayName: string }>((resolve) => {
        clientB.onMessage('interactionReceived', resolve)
      })
      clientA.send('interaction', { kind: 'hello', targetSessionId: clientB.sessionId })

      const payload = await received
      expect(payload).toEqual({ kind: 'hello', fromSessionId: clientA.sessionId, fromDisplayName: 'Alice' })
    })

    it('does not deliver anything when the sender is busy', async () => {
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
      // clientB connects first and does the waiting below — matching every other test's pattern
      // in this file (waiting on the earlier-connected client, whose `.state` has settled by the
      // time the second `connectTo` resolves) instead of waiting on the client that just connected.
      const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman'))
      const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man', { presence: 'busy' }))
      await waitFor(clientB, () => clientB.state.players.get(clientA.sessionId)?.presence === 'busy')

      let received = false
      clientB.onMessage('interactionReceived', () => {
        received = true
      })
      clientA.send('interaction', { kind: 'hello', targetSessionId: clientB.sessionId })

      // No positive signal to wait on for a message that's never sent — a settle delay stands in
      // for "nothing arrived", same shape as the other silent-no-op cases below.
      await new Promise(resolve => setTimeout(resolve, 200))
      expect(received).toBe(false)
    })

    it('does not deliver anything when the target is busy', async () => {
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
      const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man'))
      const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman', { presence: 'busy' }))
      await waitFor(clientA, () => clientA.state.players.get(clientB.sessionId)?.presence === 'busy')

      let received = false
      clientB.onMessage('interactionReceived', () => {
        received = true
      })
      clientA.send('interaction', { kind: 'hello', targetSessionId: clientB.sessionId })

      await new Promise(resolve => setTimeout(resolve, 200))
      expect(received).toBe(false)
    })

    it('is a silent no-op for an unknown targetSessionId', async () => {
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
      const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man'))

      // No assertion beyond "doesn't throw" — there's no second client to receive anything.
      clientA.send('interaction', { kind: 'hello', targetSessionId: 'no-such-session' })
      await new Promise(resolve => setTimeout(resolve, 200))
    })

    it('relays an attention kind the same way, even though no client feature sends it yet', async () => {
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
      const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man'))
      const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman'))
      await waitFor(clientA, () => clientA.state.players.has(clientB.sessionId))

      const received = new Promise<{ kind: string }>((resolve) => {
        clientB.onMessage('interactionReceived', resolve)
      })
      clientA.send('interaction', { kind: 'attention', targetSessionId: clientB.sessionId })

      expect((await received).kind).toBe('attention')
    })
  })

  describe('one avatar per account (issue #232)', () => {
    it('removes the previous avatar and closes its connection when the same account joins again', async () => {
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
      const observer = await colyseus.connectTo(room, joinAs('Observer', 'woman'))

      const firstJoin = await colyseus.connectTo(room, joinAs('Alice', 'man', { userId: 'account-1' }))
      await waitFor(observer, () => observer.state.players.has(firstJoin.sessionId))
      const closedWith = new Promise<number>(resolve => firstJoin.onLeave(code => resolve(code)))

      // Another tab or device: the old connection is still open (no leave() call) when the same account joins.
      const secondJoin = await colyseus.connectTo(room, joinAs('Alice', 'man', { userId: 'account-1' }))
      await waitFor(observer, () => !observer.state.players.has(firstJoin.sessionId))

      expect(observer.state.players.has(secondJoin.sessionId)).toBe(true)
      expect(observer.state.players.size).toBe(2) // observer + secondJoin only
      expect(await closedWith).toBe(CLOSE_CODE_SESSION_REPLACED)
    })

    it('keeps both avatars for two different accounts, even with the same display name', async () => {
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
      const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man', { userId: 'account-a' }))
      const clientB = await colyseus.connectTo(room, joinAs('Alice', 'woman', { userId: 'account-b' }))

      await waitFor(clientA, () => clientA.state.players.has(clientB.sessionId))
      expect(clientA.state.players.has(clientA.sessionId)).toBe(true)
      expect(clientA.state.players.has(clientB.sessionId)).toBe(true)
    })

    it('does not leak the user id to other clients\' synced state', async () => {
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
      const clientA = await colyseus.connectTo(room, joinAs('Alice', 'man', { userId: 'account-secret' }))
      const clientB = await colyseus.connectTo(room, joinAs('Bob', 'woman'))
      await nextStateChange(clientB)
      await waitFor(clientB, () => clientB.state.players.has(clientA.sessionId))

      const aFromB = clientB.state.players.get(clientA.sessionId) as unknown as Record<string, unknown>
      expect(aFromB.userId).toBeUndefined()
    })
  })

  describe('join authentication (onAuth, issue #232)', () => {
    afterEach(() => {
      setOfficeRoomAuthenticator(fakeAuthenticator)
    })

    it('takes name and avatar from the account, ignoring whatever the client claims', async () => {
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))
      const client = await colyseus.connectTo(room, { ...joinAs('Alice', 'woman'), displayName: 'Mallory', spriteType: 'man' })

      await nextStateChange(client)
      const avatar = client.state.players.get(client.sessionId)
      expect(avatar?.displayName).toBe('Alice')
      expect(avatar?.spriteType).toBe('woman')
    })

    it('rejects a ticket the authenticator does not accept', async () => {
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))

      await expect(colyseus.connectTo(room, { ticket: INVALID_TICKET })).rejects.toThrow()
    })

    it('rejects a join with no ticket, and the old guest-style options', async () => {
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))

      await expect(colyseus.connectTo(room, {})).rejects.toThrow()
      await expect(colyseus.connectTo(room, { displayName: 'Alice', spriteType: 'man', accessCode: '' })).rejects.toThrow()
    })

    it('refuses everyone while no authenticator is configured (fails closed)', async () => {
      setOfficeRoomAuthenticator(null)
      const room = await colyseus.createRoom('office', joinAs('Alice', 'man'))

      await expect(colyseus.connectTo(room, joinAs('Alice', 'man'))).rejects.toThrow()
    })
  })
})
