import type { Page } from '@playwright/test'

/** A remote person's tile once the call has connected: an avatar with its mic dot (a pending tile only shows a spinner). */
export const connectedTile = (page: Page, name: string) => page.locator('.tile', { hasText: name }).locator('.mic-dot')
export const pendingTile = (page: Page, name: string) => page.locator('.tile', { hasText: name }).locator('.connecting-spinner')
export const cameraButton = (page: Page) => page.getByRole('button', { name: /Turn camera/ })
