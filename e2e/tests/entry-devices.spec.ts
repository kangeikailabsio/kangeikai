import { expect, test } from '@playwright/test'
import { newPlayer } from '../support/accounts'
import { enterTheOffice } from '../support/game'

async function openEntryScreen(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/room')
  await expect(page.getByRole('heading', { name: 'Join the space' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit avatar' })).toBeVisible()
}

test('the entry screen starts the camera and the microphone by itself, with a live preview', async ({ browser }) => {
  const { page, context } = await newPlayer(browser, 'Preview')

  await openEntryScreen(page)

  await expect(page.getByRole('switch', { name: 'Camera' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('switch', { name: 'Microphone' })).toHaveAttribute('aria-checked', 'true')
  const video = page.locator('.camera-preview video')
  await expect(video).toBeVisible()
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThanOrEqual(2)
  await expect(page.getByRole('combobox', { name: 'Camera device' })).toBeEnabled()
  await expect(page.getByRole('combobox', { name: 'Microphone device' })).toBeEnabled()
  await context.close()
})

test('switching the camera off ends the preview', async ({ browser }) => {
  const { page, context } = await newPlayer(browser, 'Shy')
  await openEntryScreen(page)
  await expect(page.locator('.camera-preview video')).toBeVisible()

  await page.getByRole('switch', { name: 'Camera' }).click()

  await expect(page.locator('.camera-preview video')).toHaveCount(0)
  await expect(page.getByText('Camera off')).toBeVisible()
  await context.close()
})

test('enters with the camera and the microphone as the switches were left', async ({ browser }) => {
  const { page, context } = await newPlayer(browser, 'Both')

  await enterTheOffice(page, { camera: true, microphone: false })

  await expect(page.getByRole('button', { name: '📷 Turn camera off' })).toBeVisible()
  await expect(page.getByRole('button', { name: '🔇 Unmute' })).toBeVisible()
  await context.close()
})

test('enters with the camera off and the microphone on when the camera is switched off', async ({ browser }) => {
  const { page, context } = await newPlayer(browser, 'Audio')

  await enterTheOffice(page, { camera: false, microphone: true })

  await expect(page.getByRole('button', { name: '📷 Turn camera on' })).toBeVisible()
  await expect(page.getByRole('button', { name: '🎤 Mute' })).toBeVisible()
  await context.close()
})

test('a blocked camera is explained and does not stop the person from joining', async ({ browser }) => {
  const { page, context } = await newPlayer(browser, 'Blocked')
  // The browser refuses the camera and nothing else: a blocked permission, reproduced without touching the browser's settings.
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints?.video)
        throw new DOMException('Permission denied', 'NotAllowedError')
      return original(constraints)
    }
  })

  await openEntryScreen(page)

  await expect(page.getByText('Camera blocked. Allow it in your browser\'s site settings, then reload.')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Camera device' })).toBeDisabled()
  await expect(page.getByRole('switch', { name: 'Microphone' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.locator('.camera-preview video')).toHaveCount(0)

  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page.getByRole('button', { name: '🎤 Mute' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: '📷 Camera unavailable' })).toBeVisible()
  await context.close()
})
