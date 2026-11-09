import type { Browser, BrowserContext, Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { CLIENT_URL, SERVER_URL } from './env'

export interface Account {
  name: string
  email: string
  password: string
}

let counter = 0

/** A new, unique account (the database is shared by the whole run). */
export function newAccount(name: string): Account {
  counter += 1
  return { name, email: `${name.toLowerCase()}-${Date.now()}-${counter}@e2e.test`, password: 'e2e-password-123' }
}

/**
 * Creates the account through the API and leaves the context signed in: the browser context's
 * request client shares its cookie jar with the pages opened from it.
 */
export async function signUp(context: BrowserContext, account: Account): Promise<void> {
  const response = await context.request.post(`${SERVER_URL}/api/auth/sign-up/email`, {
    headers: { Origin: CLIENT_URL },
    data: { name: account.name, email: account.email, password: account.password },
  })
  expect(response.ok(), `sign up ${account.email}`).toBe(true)
}

export interface Player {
  account: Account
  context: BrowserContext
  page: Page
}

/** A signed-in player in a context of their own (a separate browser profile, as another person would have). */
export async function newPlayer(browser: Browser, name: string): Promise<Player> {
  // Contexts made with `browser.newContext()` do not inherit the config's `use` options.
  const context = await browser.newContext({ permissions: ['microphone', 'camera'] })
  const account = newAccount(name)
  await signUp(context, account)
  return { account, context, page: await context.newPage() }
}
