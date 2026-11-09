import { expect, test } from '@playwright/test'

test('a visitor without a session is sent to sign in', async ({ page }) => {
  await page.goto('/room')

  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})
