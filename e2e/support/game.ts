import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

interface E2eHook {
  teleport: (x: number, y: number) => void
  position: () => { x: number, y: number }
  walkTo: (x: number, y: number) => void
  isWalking: () => boolean
  leave: () => void
  activeRoom: () => 'office' | 'private'
}

/** Goes through the entry form (name and a generated avatar come from the account) and waits for the game HUD. */
export async function enterTheOffice(page: Page): Promise<void> {
  await page.goto('/room')
  await expect(page.getByRole('heading', { name: 'Join the space' })).toBeVisible()
  // The avatar of a new account is generated in the browser; "Edit avatar" appears once it is ready.
  await expect(page.getByRole('button', { name: 'Edit avatar' })).toBeVisible()
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page.getByRole('button', { name: /Mute|Unmute/ })).toBeVisible({ timeout: 30_000 })
  await page.waitForFunction(() => '__kangeikaiE2E' in window)
}

export async function teleport(page: Page, point: { x: number, y: number }): Promise<void> {
  await page.evaluate(({ x, y }) => (window as unknown as { __kangeikaiE2E: E2eHook }).__kangeikaiE2E.teleport(x, y), point)
}

export async function position(page: Page): Promise<{ x: number, y: number }> {
  return page.evaluate(() => (window as unknown as { __kangeikaiE2E: E2eHook }).__kangeikaiE2E.position())
}

export const muteButton = (page: Page) => page.getByRole('button', { name: /Mute|Unmute/ })

/** Waits for the call to be in the given LiveKit room. A nearby person's tile shows up in the office long before a private room is connected, so tiles say nothing about this. */
export async function waitForRoom(page: Page, room: 'office' | 'private'): Promise<void> {
  await page.waitForFunction(expected => (window as unknown as { __kangeikaiE2E: E2eHook }).__kangeikaiE2E.activeRoom() === expected, room, { timeout: 30_000 })
}

/** Gives the office audio time to reconnect after a room switch before a state is asserted, so a late change is not missed. */
export const SETTLE_AFTER_ROOM_SWITCH_MS = 4_000

/** Walks along the game's own route-finding (around furniture and walls) and resolves once the avatar has arrived. */
export async function walkTo(page: Page, point: { x: number, y: number }): Promise<void> {
  await page.evaluate(({ x, y }) => (window as unknown as { __kangeikaiE2E: E2eHook }).__kangeikaiE2E.walkTo(x, y), point)
  await page.waitForFunction(() => !(window as unknown as { __kangeikaiE2E: E2eHook }).__kangeikaiE2E.isWalking(), undefined, { timeout: 60_000 })
}

/**
 * Leaves the office cleanly before a browser is closed, so the others do not see a lingering ghost of this person (see
 * the hook's `leave`). Does nothing for a page that never entered the office (it has no hook).
 */
export async function leaveOffice(page: Page): Promise<void> {
  const left = await page.evaluate(() => {
    const hook = (window as unknown as { __kangeikaiE2E?: E2eHook }).__kangeikaiE2E
    hook?.leave()
    return hook !== undefined
  })
  if (left)
    await page.waitForTimeout(800) // lets the server and LiveKit register the departure
}
