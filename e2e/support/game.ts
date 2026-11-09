import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

interface E2eHook {
  teleport: (x: number, y: number) => void
  position: () => { x: number, y: number }
  activeRoom: () => 'office' | 'private'
}

/** Puts the entry screen's switch for a device on or off and waits for it to say so. */
export async function setEntrySwitch(page: Page, device: 'Camera' | 'Microphone', on: boolean): Promise<void> {
  const toggle = page.getByRole('switch', { name: device })
  if ((await toggle.getAttribute('aria-checked')) !== String(on))
    await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', String(on))
}

/**
 * Goes through the entry form (name and a generated avatar come from the account) and waits for the game HUD. Both
 * devices start on in the preview; the switches are set as asked before "Enter", because that is the state the person
 * enters with. By default the camera enters off and the microphone on, which is what the specs were written against.
 */
export async function enterTheOffice(page: Page, options: { camera?: boolean, microphone?: boolean } = {}): Promise<void> {
  const { camera = false, microphone = true } = options
  await page.goto('/room')
  await expect(page.getByRole('heading', { name: 'Join the space' })).toBeVisible()
  // The avatar of a new account is generated in the browser; "Edit avatar" appears once it is ready.
  await expect(page.getByRole('button', { name: 'Edit avatar' })).toBeVisible()
  await setEntrySwitch(page, 'Camera', camera)
  await setEntrySwitch(page, 'Microphone', microphone)
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page.getByRole('button', { name: /Mute|Unmute|Mic unavailable/ })).toBeVisible({ timeout: 30_000 })
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
