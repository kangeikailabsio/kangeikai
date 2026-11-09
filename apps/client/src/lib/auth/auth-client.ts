import { PUBLIC_AUTH_URL } from '$env/static/public'
import { createAuthClient } from 'better-auth/svelte'

/** Origin of the account server, shared by the auth client below and the profile/ticket calls. */
export const AUTH_URL = PUBLIC_AUTH_URL

/**
 * The better-auth client every account page talks to (issue #232). `credentials: 'include'` lets
 * the session cookie travel to the server, which lives on another origin (a sibling subdomain in
 * production, another port in dev).
 */
export const authClient = createAuthClient({
  baseURL: AUTH_URL,
  fetchOptions: { credentials: 'include' },
})
