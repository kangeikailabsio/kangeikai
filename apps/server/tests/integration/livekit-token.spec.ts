import type { Server as HttpServer } from 'node:http'
import express from 'express'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { registerLiveKitTokenRoute } from '../../src/http/livekit-token'
import { computeSessionProof } from '../../src/session-proof'

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
  process.env.SESSION_SIGNING_SECRET = 'test-secret'
  process.env.LIVEKIT_URL = 'ws://localhost:7880'
  process.env.LIVEKIT_API_KEY = 'test-key'
  process.env.LIVEKIT_API_SECRET = 'test-secret-key-that-is-long-enough'
})

afterEach(() => {
  delete process.env.SESSION_SIGNING_SECRET
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

describe('post /livekit-token', () => {
  it('rejects a request with no proof (400)', async () => {
    const response = await postToken({ identity: 'session-a', name: 'Guest' })
    expect(response.status).toBe(400)
  })

  it('rejects a request with a wrong proof (403)', async () => {
    const response = await postToken({ identity: 'session-a', name: 'Guest', proof: 'wrong' })
    expect(response.status).toBe(403)
  })

  it('rejects a proof computed for a different identity (403)', async () => {
    const proof = computeSessionProof('session-b')
    const response = await postToken({ identity: 'session-a', name: 'Guest', proof })
    expect(response.status).toBe(403)
  })

  it('mints a token given the correct proof (200)', async () => {
    const proof = computeSessionProof('session-a')
    const response = await postToken({ identity: 'session-a', name: 'Guest', proof })
    expect(response.status).toBe(200)

    const body = await response.json() as { token: string, url: string }
    expect(body.token).toEqual(expect.any(String))
    expect(body.url).toBe('ws://localhost:7880')
  })

  it('returns 500 when SESSION_SIGNING_SECRET is not configured', async () => {
    delete process.env.SESSION_SIGNING_SECRET
    const response = await postToken({ identity: 'session-a', name: 'Guest', proof: 'anything' })
    expect(response.status).toBe(500)
  })

  it('mints a token scoped to a private zone room (200)', async () => {
    const proof = computeSessionProof('session-a')
    const response = await postToken({ identity: 'session-a', name: 'Guest', proof, room: 'private-42' })
    expect(response.status).toBe(200)

    const body = await response.json() as { token: string, url: string }
    expect(body.token).toEqual(expect.any(String))
  })

  it('rejects a room name that is not the private-<id> format (400)', async () => {
    const proof = computeSessionProof('session-a')
    const response = await postToken({ identity: 'session-a', name: 'Guest', proof, room: 'office' })
    expect(response.status).toBe(400)
  })
})
