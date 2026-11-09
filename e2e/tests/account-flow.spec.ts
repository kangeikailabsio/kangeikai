import { expect, test } from '@playwright/test'
import { newAccount } from '../support/accounts'

test('signing up from the page leads to the entry form with the account name, then into the office', async ({ page }) => {
  const account = newAccount('Maria')

  await page.goto('/sign-up')
  await page.getByLabel('Name').fill(account.name)
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/room$/)
  await expect(page.getByRole('heading', { name: 'Join the space' })).toBeVisible()
  await expect(page.getByLabel('Name')).toHaveValue(account.name)
  await expect(page.getByRole('button', { name: 'Edit avatar' })).toBeVisible()
  await page.getByRole('button', { name: 'Enter' }).click()
  await expect(page.getByRole('button', { name: /Mute|Unmute/ })).toBeVisible({ timeout: 30_000 })
})

test('a wrong password is explained without saying which part was wrong', async ({ page }) => {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill('nobody@e2e.test')
  await page.getByLabel('Password').fill('not-the-password')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('alert')).toHaveText('Wrong email or password.')
  await expect(page).toHaveURL(/\/sign-in$/)
})
