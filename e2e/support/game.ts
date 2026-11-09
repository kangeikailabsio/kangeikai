import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

interface E2eHook {
  teleport: (x: number, y: number) => void
  position: () => { x: number, y: number }
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
