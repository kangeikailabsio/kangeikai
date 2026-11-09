import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

/** A ticket is only needed for the moment of joining the room, so it lives for a minute. */
const TICKET_TTL_MS = 60_000

/** Keeps a ticket signature from being valid in any other place the same secret signs something. */
const DOMAIN = 'kangeikai:session-ticket:'

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(DOMAIN + payload).digest('hex')
}

/**
 * A short-lived, signed "this person is user N" pass (issue #232). The web client asks for one
 * with its session cookie and shows it when joining the room, so the realtime connection does not
 * depend on the cookie travelling over the WebSocket. Stateless: `<userId>.<expiresAtMs>.<hmac>`.
 *
 * `userId` is numeric because better-auth's ids are integer identity columns (issue #231).
 */
export function createSessionTicket(userId: string, secret: string, now = Date.now(), ttlMs = TICKET_TTL_MS): string {
  const payload = `${userId}.${now + ttlMs}`
  return `${payload}.${sign(payload, secret)}`
}

/** The user id a valid, unexpired ticket was issued for, or `null` for anything else. */
export function verifySessionTicket(ticket: string, secret: string, now = Date.now()): string | null {
  const parts = ticket.split('.')
  if (parts.length !== 3)
    return null

  const [userId, expiresAt, signature] = parts
  if (!/^\d+$/.test(userId) || !/^\d+$/.test(expiresAt))
    return null

  const expected = Buffer.from(sign(`${userId}.${expiresAt}`, secret))
  const received = Buffer.from(signature)
  if (expected.length !== received.length || !timingSafeEqual(expected, received))
    return null

  return Number(expiresAt) > now ? userId : null
}
