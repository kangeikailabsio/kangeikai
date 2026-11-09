import { AccountApiError, createAccountApi, describeAccountError } from '$lib/account/account-api'
import { describe, expect, it, vi } from 'vitest'

const BASE = 'https://server.example.com'

function respond(status: number, body: unknown = {}) {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))
}

describe('account api (issue #232)', () => {
  it('asks for a session ticket with the cookie included and returns it', async () => {
    const fetchFn = respond(200, { ticket: '1.2.abc' })

    const ticket = await createAccountApi(BASE, fetchFn).fetchSessionTicket()

    expect(ticket).toBe('1.2.abc')
    expect(fetchFn).toHaveBeenCalledWith(`${BASE}/api/session-ticket`, expect.objectContaining({ method: 'POST', credentials: 'include' }))
  })

  it('saves the profile as JSON with the cookie included', async () => {
    const fetchFn = respond(200)

    await createAccountApi(BASE, fetchFn).saveProfile({ displayName: 'Ana', spriteType: 'woman' })

    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${BASE}/api/profile`)
    expect(init).toMatchObject({ method: 'PUT', credentials: 'include' })
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({ displayName: 'Ana', spriteType: 'woman' })
  })

  it('tells "not signed in" apart from other failures', async () => {
    await expect(createAccountApi(BASE, respond(401)).fetchSessionTicket()).rejects.toMatchObject({ kind: 'unauthorized', status: 401 })
    await expect(createAccountApi(BASE, respond(401)).saveProfile({ displayName: 'Ana', spriteType: 'man' })).rejects.toMatchObject({ kind: 'unauthorized' })
  })

  it('reports a rejected profile as invalid and a server failure as such', async () => {
    await expect(createAccountApi(BASE, respond(400)).saveProfile({ displayName: '', spriteType: 'man' })).rejects.toMatchObject({ kind: 'invalid', status: 400 })
    await expect(createAccountApi(BASE, respond(500)).fetchSessionTicket()).rejects.toMatchObject({ kind: 'server', status: 500 })
    await expect(createAccountApi(BASE, respond(403)).fetchSessionTicket()).rejects.toMatchObject({ kind: 'server', status: 403 })
  })

  it('reports an unreachable server as a network error', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })

    await expect(createAccountApi(BASE, fetchFn).fetchSessionTicket()).rejects.toMatchObject({ kind: 'network' })
    await expect(createAccountApi(BASE, fetchFn).fetchSessionTicket()).rejects.toBeInstanceOf(AccountApiError)
  })

  it('rejects a ticket response without a ticket', async () => {
    await expect(createAccountApi(BASE, respond(200, {})).fetchSessionTicket()).rejects.toMatchObject({ kind: 'server' })
  })

  it('tolerates a trailing slash in the base url', async () => {
    const fetchFn = respond(200, { ticket: 't' })

    await createAccountApi(`${BASE}/`, fetchFn).fetchSessionTicket()

    expect(fetchFn).toHaveBeenCalledWith(`${BASE}/api/session-ticket`, expect.anything())
  })
})

describe('describeAccountError (issue #232)', () => {
  it('says what to do for each kind of failure, never echoing server text', () => {
    expect(describeAccountError(new AccountApiError('network'))).toBe('Couldn\'t reach the server. Check your connection and try again.')
    expect(describeAccountError(new AccountApiError('invalid', 400))).toBe('Couldn\'t save your profile. Check your name and try again.')
    expect(describeAccountError(new AccountApiError('server', 500))).toBe('Couldn\'t join. Try again.')
    expect(describeAccountError(new Error('boom'))).toBe('Couldn\'t join. Try again.')
  })
})
