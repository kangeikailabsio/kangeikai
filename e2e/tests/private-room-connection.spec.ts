import { expect, test } from '@playwright/test'
import { newPlayer } from '../support/accounts'
import { connectedTile, pendingTile } from '../support/calls'
import { enterTheOffice, teleport, waitForRoom } from '../support/game'
import { privateZoneCenter } from '../support/zones'

test('a failed private-room connection shows an error that "Try again" recovers from (issue #225)', async ({ browser }) => {
  const ana = await newPlayer(browser, 'Ana')
  const bruno = await newPlayer(browser, 'Bruno')
  await enterTheOffice(ana.page)
  await enterTheOffice(bruno.page)

  // Bruno's token requests fail from now on (the office call was already connected at join).
  let blocked = true
  await bruno.page.route('**/livekit-token', route => (blocked ? route.abort() : route.continue()))

  const desk = privateZoneCenter('desk-01')
  await teleport(ana.page, desk)
  await teleport(bruno.page, desk)

  // After the automatic retries Bruno sees the error; Ana, connected, sees Bruno as still connecting.
  await expect(bruno.page.getByText('Couldn\'t connect')).toBeVisible({ timeout: 30_000 })
  await expect(pendingTile(ana.page, 'Bruno')).toBeVisible()

  blocked = false
  await bruno.page.getByRole('button', { name: 'Try again' }).click()

  await waitForRoom(bruno.page, 'private')
  await expect(connectedTile(bruno.page, 'Ana')).toBeVisible({ timeout: 30_000 })
  await expect(connectedTile(ana.page, 'Bruno')).toBeVisible({ timeout: 30_000 })
  await ana.context.close()
  await bruno.context.close()
})

// Issue #272 (with #259, which puts a returning account back where it was): refreshing while in a
// private call and entering again lands in the same call, with the camera as chosen on the entry screen.
test('refreshing inside a private call and entering again puts the person back in that call (issue #272)', async ({ browser }) => {
  const ana = await newPlayer(browser, 'Ana')
  const bruno = await newPlayer(browser, 'Bruno')
  await enterTheOffice(ana.page)
  await enterTheOffice(bruno.page)
  const desk = privateZoneCenter('desk-01')
  await teleport(ana.page, desk)
  await teleport(bruno.page, desk)
  await waitForRoom(ana.page, 'private')
  await waitForRoom(bruno.page, 'private')
  await expect(connectedTile(ana.page, 'Bruno')).toBeVisible()
  // Lets Ana's last position reach the server before the page goes away.
  await ana.page.waitForTimeout(1_000)

  await ana.page.reload()
  await enterTheOffice(ana.page, { camera: true })

  await waitForRoom(ana.page, 'private')
  await expect(connectedTile(ana.page, 'Bruno')).toBeVisible()
  await expect(ana.page.getByRole('button', { name: '📷 Turn camera off' })).toBeVisible()
  await ana.context.close()
  await bruno.context.close()
})
