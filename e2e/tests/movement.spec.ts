import { expect, test } from '@playwright/test'
import { newPlayer } from '../support/accounts'
import { enterTheOffice, position } from '../support/game'

test('the avatar walks with the arrow keys', async ({ browser }) => {
  const { page, context } = await newPlayer(browser, 'Walker')
  await enterTheOffice(page)
  const before = await position(page)

  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(700)
  await page.keyboard.up('ArrowRight')

  const after = await position(page)
  expect(after.x).toBeGreaterThan(before.x + 20)
  await context.close()
})
