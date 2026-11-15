import { expect, test } from '@playwright/test'
import { newPlayer } from '../support/accounts'
import { enterTheOffice, position } from '../support/game'

test('after a refresh the person enters where they were (issue #259)', async ({ browser }) => {
  const { page, context } = await newPlayer(browser, 'Returner')
  await enterTheOffice(page)
  const spawn = await position(page)

  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(900)
  await page.keyboard.up('ArrowRight')
  // Lets the last position reach the server before the page goes away.
  await page.waitForTimeout(500)
  const before = await position(page)
  expect(before.x).toBeGreaterThan(spawn.x + 20)

  await page.reload()
  await enterTheOffice(page)

  const after = await position(page)
  expect(Math.abs(after.x - before.x)).toBeLessThan(2)
  expect(Math.abs(after.y - before.y)).toBeLessThan(2)
  await context.close()
})

test('a different account does not inherit the place of someone who left', async ({ browser }) => {
  const first = await newPlayer(browser, 'Leaver')
  await enterTheOffice(first.page)
  await first.page.keyboard.down('ArrowRight')
  await first.page.waitForTimeout(900)
  await first.page.keyboard.up('ArrowRight')
  await first.page.waitForTimeout(500)
  const leftAt = await position(first.page)
  await first.page.close()

  const second = await newPlayer(browser, 'Newcomer')
  await enterTheOffice(second.page)

  const arrivedAt = await position(second.page)
  expect(Math.hypot(arrivedAt.x - leftAt.x, arrivedAt.y - leftAt.y)).toBeGreaterThan(2)
  await first.context.close()
  await second.context.close()
})
