import { describe, expect, it } from 'vitest'
import { createSessionTicket, verifySessionTicket } from '../../src/auth/session-ticket'

const secret = 'a-test-secret-that-is-long-enough-for-hmac'
const now = 1_700_000_000_000

describe('session ticket (issue #232)', () => {
  it('verifies a fresh ticket and returns the user id', () => {
    const ticket = createSessionTicket('42', secret, now)

    expect(verifySessionTicket(ticket, secret, now + 1_000)).toBe('42')
  })

  it('expires after its lifetime, to the millisecond', () => {
    const ticket = createSessionTicket('42', secret, now, 60_000)

    expect(verifySessionTicket(ticket, secret, now + 59_999)).toBe('42')
    expect(verifySessionTicket(ticket, secret, now + 60_000)).toBeNull()
  })

  it('rejects a ticket signed with another secret', () => {
    const ticket = createSessionTicket('42', 'another-secret-that-is-long-enough!!', now)

    expect(verifySessionTicket(ticket, secret, now)).toBeNull()
  })

  it('rejects a ticket whose user id or expiry was altered', () => {
    const [userId, expiresAt, signature] = createSessionTicket('42', secret, now).split('.')

    expect(verifySessionTicket(`43.${expiresAt}.${signature}`, secret, now)).toBeNull()
    expect(verifySessionTicket(`${userId}.${Number(expiresAt) + 3_600_000}.${signature}`, secret, now)).toBeNull()
  })

  it('rejects malformed input without throwing', () => {
    for (const bad of ['', 'x', '1.2', '1.2.3.4', 'a.b.c', '1..sig', '1.2.', `1.${now + 1}.${'0'.repeat(10)}`])
      expect(verifySessionTicket(bad, secret, now)).toBeNull()
  })

  it('is not interchangeable with another signature scheme (domain separation)', async () => {
    const { createHmac } = await import('node:crypto')
    const payload = `42.${now + 60_000}`
    const plain = createHmac('sha256', secret).update(payload).digest('hex')

    expect(verifySessionTicket(`${payload}.${plain}`, secret, now)).toBeNull()
  })
})
