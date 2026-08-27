import type { Application, Request, Response } from 'express'
import process from 'node:process'
import express from 'express'
import { AccessToken } from 'livekit-server-sdk'
import * as v from 'valibot'
import { verifySessionProof } from '../session-proof'

/** The single, fixed, well-known LiveKit room every participant joins by default (contract). */
const PROXIMITY_ROOM_NAME = 'office'

/** Matches `private-<zoneId>` room names minted for a `spaces` layer object's Tiled `id` — the only alternative to the default `office` room this endpoint will grant (see `PrivateRoomController`'s `roomNameForZone`). */
const PRIVATE_ROOM_NAME_PATTERN = /^private-\d+$/

/** Client→server request body (contracts/livekit-token-endpoint.md's LiveKitTokenRequest). */
const liveKitTokenRequestSchema = v.object({
  identity: v.pipe(v.string(), v.nonEmpty()),
  name: v.pipe(v.string(), v.nonEmpty()),
  // Proves `identity` came from OfficeRoom.onJoin (session-proof.ts) rather than being an
  // unauthenticated request forging an arbitrary identity (security review finding).
  proof: v.pipe(v.string(), v.nonEmpty()),
  // Omitted (or absent) -> the shared `office` room. Only a `private-<zoneId>` room is
  // otherwise accepted, so this can't be used to mint a token for an arbitrary LiveKit room.
  room: v.optional(v.pipe(v.string(), v.regex(PRIVATE_ROOM_NAME_PATTERN))),
})

export function registerLiveKitTokenRoute(app: Application): void {
  app.post('/livekit-token', express.json(), (req: Request, res: Response) => {
    const result = v.safeParse(liveKitTokenRequestSchema, req.body)
    if (!result.success) {
      res.status(400).json({ error: 'Invalid request body' })
      return
    }

    const { identity, name, proof, room: requestedRoom } = result.output

    if (!process.env.SESSION_SIGNING_SECRET) {
      res.status(500).json({ error: 'Session signing is not configured' })
      return
    }

    if (!verifySessionProof(identity, proof)) {
      res.status(403).json({ error: 'Invalid session proof' })
      return
    }

    const url = process.env.LIVEKIT_URL
    const apiKey = process.env.LIVEKIT_API_KEY
    const apiSecret = process.env.LIVEKIT_API_SECRET
    if (!url || !apiKey || !apiSecret) {
      res.status(500).json({ error: 'LiveKit is not configured' })
      return
    }

    const token = new AccessToken(apiKey, apiSecret, { identity, name })
    token.addGrant({ room: requestedRoom ?? PROXIMITY_ROOM_NAME, roomJoin: true, canPublish: true, canSubscribe: true })

    token.toJwt()
      .then(jwt => res.json({ token: jwt, url }))
      .catch((error: unknown) => {
        console.error('kangeikai: failed to mint LiveKit token', error)
        res.status(500).json({ error: 'Failed to mint token' })
      })
  })
}
