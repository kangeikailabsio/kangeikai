import type { ProfileUpdateBody } from './account-profile'

export type AccountApiErrorKind = 'unauthorized' | 'invalid' | 'network' | 'server'

export class AccountApiError extends Error {
  constructor(readonly kind: AccountApiErrorKind, readonly status = 0) {
    super(`account api: ${kind}${status ? ` (${status})` : ''}`)
  }
}

export interface AccountApi {
  /** A short-lived pass to show when joining the office room (server: `POST /api/session-ticket`). */
  fetchSessionTicket: () => Promise<string>
  /** Saves the signed-in person's name and avatar (server: `PUT /api/profile`). */
  saveProfile: (profile: ProfileUpdateBody) => Promise<void>
}

function kindFor(status: number): AccountApiErrorKind {
  if (status === 401)
    return 'unauthorized'
  if (status === 400)
    return 'invalid'
  return 'server'
}

/**
 * The two calls the web client makes to the account server besides better-auth's own (issue #232).
 * Both send the session cookie (`credentials: 'include'`); `fetchFn` is injectable for tests.
 */
export function createAccountApi(baseUrl: string, fetchFn: typeof fetch = fetch): AccountApi {
  const root = baseUrl.replace(/\/+$/, '')

  async function call(path: string, init: RequestInit): Promise<Response> {
    let response: Response
    try {
      response = await fetchFn(`${root}${path}`, { ...init, credentials: 'include' })
    }
    catch {
      throw new AccountApiError('network')
    }
    if (!response.ok)
      throw new AccountApiError(kindFor(response.status), response.status)
    return response
  }

  return {
    async fetchSessionTicket() {
      const response = await call('/api/session-ticket', { method: 'POST' })
      const body = await response.json().catch(() => ({})) as { ticket?: unknown }
      if (typeof body.ticket !== 'string' || body.ticket === '')
        throw new AccountApiError('server', response.status)
      return body.ticket
    },

    async saveProfile(profile) {
      await call('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
    },
  }
}

/** The sentence to show when saving the profile or getting a join ticket fails (never the server's own text). */
export function describeAccountError(error: unknown): string {
  if (error instanceof AccountApiError) {
    if (error.kind === 'network')
      return 'Couldn\'t reach the server. Check your connection and try again.'
    if (error.kind === 'invalid')
      return 'Couldn\'t save your profile. Check your name and try again.'
  }
  return 'Couldn\'t join. Try again.'
}
