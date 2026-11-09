import { expect, test } from '@playwright/test'
import { newPlayer } from '../support/accounts'
import { enterTheOffice, position, walkTo } from '../support/game'
import { privateZoneCenter } from '../support/zones'

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

test('the avatar walks to a point on its own, around the furniture', async ({ browser }) => {
  const { page, context } = await newPlayer(browser, 'Guide')
  await enterTheOffice(page)
  const desk = privateZoneCenter('desk-01')

  await walkTo(page, desk)

  const arrived = await position(page)
  expect(Math.hypot(arrived.x - desk.x, arrived.y - desk.y)).toBeLessThan(12)
  await context.close()
})
