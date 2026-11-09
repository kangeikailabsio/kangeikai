import { expect, test } from '@playwright/test'
import { LOOKS } from './support/looks'
import { finishClip, newActor } from './support/recording'

// The character creator: pieces change in the preview, then the avatar is saved. Cropped to the modal.
test('your-avatar', async ({ browser }) => {
  const ana = await newActor(browser, 'Ana', LOOKS.ana, 'your-avatar')
  const { page } = ana
  await page.goto('/room')
  await expect(page.getByRole('button', { name: 'Edit avatar' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit avatar' }).click()
  const dialog = page.getByRole('dialog', { name: 'Character Creator' })
  await expect(dialog).toBeVisible()

  const startMs = ana.elapsed()
  const pause = () => page.waitForTimeout(650)
  await pause()
  await dialog.getByLabel('Hairstyle style').selectOption({ index: 4 })
  await pause()
  await dialog.getByLabel('Hairstyle variant').selectOption({ index: 2 })
  await pause()
  await dialog.getByLabel('Outfit style').selectOption({ index: 9 })
  await pause()
  await dialog.getByLabel('Outfit variant').selectOption({ index: 1 })
  await pause()
  await dialog.getByLabel('Eyes').selectOption({ index: 3 })
  await pause()
  await dialog.getByRole('button', { name: 'Side' }).click()
  await pause()
  await dialog.getByRole('button', { name: 'Back' }).click()
  await pause()
  await dialog.getByRole('button', { name: 'Front' }).click()
  await pause()
  await dialog.getByRole('button', { name: 'Shuffle' }).click()
  await page.waitForTimeout(1_100)
  await dialog.getByRole('button', { name: 'Shuffle' }).click()
  await page.waitForTimeout(1_300)
  const endMs = ana.elapsed()

  await finishClip(ana, { clip: 'your-avatar', startMs, endMs, posterMs: 2_500, crop: { x: 160, y: 90, width: 960, height: 540 } })
})
