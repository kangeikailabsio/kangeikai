import { expect, test } from '@playwright/test'
import { newPlayer } from '../support/accounts'
import { enterTheOffice } from '../support/game'

test('the chevron of the microphone lists the device and Escape closes the menu', async ({ browser }) => {
  const { page, context } = await newPlayer(browser, 'MenuMic')
  await enterTheOffice(page)

  await page.getByRole('button', { name: 'Choose microphone' }).click()

  const menu = page.getByRole('menu', { name: 'microphone devices' })
  await expect(menu).toBeVisible()
  const current = menu.getByRole('menuitemradio', { checked: true })
  await expect(current).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await context.close()
})

test('choosing the listed camera keeps it on and the main part still toggles', async ({ browser }) => {
  const { page, context } = await newPlayer(browser, 'MenuCam')
  await enterTheOffice(page, { camera: true })

  await page.getByRole('button', { name: 'Choose camera' }).click()
  await page.getByRole('menuitemradio').first().click()

  await expect(page.getByRole('menu')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '📷 Turn camera off' })).toBeVisible()
  await page.getByRole('button', { name: '📷 Turn camera off' }).click()
  await expect(page.getByRole('button', { name: '📷 Turn camera on' })).toBeVisible()
  await context.close()
})

test('the menus are off while Busy', async ({ browser }) => {
  const { page, context } = await newPlayer(browser, 'MenuBusy')
  await enterTheOffice(page)

  await page.getByRole('button', { name: '⛔ Busy' }).click()

  await expect(page.getByRole('button', { name: 'Choose microphone' })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Choose camera' })).toBeDisabled()
  await context.close()
})
