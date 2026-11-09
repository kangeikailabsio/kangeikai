import { expect, test } from '@playwright/test'
import { newAccount, newPlayer, signUp } from '../support/accounts'
import { enterTheOffice } from '../support/game'

test('two accounts in the office see each other in the members list', async ({ browser }) => {
  const ana = await newPlayer(browser, 'Ana')
  const bruno = await newPlayer(browser, 'Bruno')
  await enterTheOffice(ana.page)
  await enterTheOffice(bruno.page)

  await ana.page.getByRole('button', { name: /Members/ }).click()

  await expect(ana.page.getByText(/Members \(2\)/)).toBeVisible()
  await expect(ana.page.locator('.member-name', { hasText: 'Bruno' })).toBeVisible()
  await ana.context.close()
  await bruno.context.close()
})

test('the same account joining from a second tab closes the first one with a notice', async ({ browser }) => {
  const context = await browser.newContext({ permissions: ['microphone', 'camera'] })
  await signUp(context, newAccount('Clara'))
  const firstTab = await context.newPage()
  const secondTab = await context.newPage()
  await enterTheOffice(firstTab)

  await enterTheOffice(secondTab)

  await expect(firstTab.getByRole('alert')).toHaveText(/joined from another tab or device/)
  await expect(secondTab.getByRole('button', { name: /Mute|Unmute/ })).toBeVisible()
  await context.close()
})
