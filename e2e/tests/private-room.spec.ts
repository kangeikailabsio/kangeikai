import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { newPlayer } from '../support/accounts'
import { enterTheOffice, muteButton, SETTLE_AFTER_ROOM_SWITCH_MS, teleport, waitForRoom } from '../support/game'
import { OUTSIDE_ZONES, privateZoneCenter } from '../support/zones'

/** A remote person's tile once the call has connected: an avatar with its mic dot (a pending tile only shows a spinner). */
const connectedTile = (page: Page, name: string) => page.locator('.tile', { hasText: name }).locator('.mic-dot')
const pendingTile = (page: Page, name: string) => page.locator('.tile', { hasText: name }).locator('.connecting-spinner')
const cameraButton = (page: Page) => page.getByRole('button', { name: /Turn camera/ })

test('leaving a private room keeps each person\'s microphone as it was (issue #222)', async ({ browser }) => {
  const ana = await newPlayer(browser, 'Ana')
  const bruno = await newPlayer(browser, 'Bruno')
  await enterTheOffice(ana.page)
  await enterTheOffice(bruno.page)
  await expect(ana.page.getByRole('button', { name: '🎤 Mute' })).toBeVisible()
  await expect(bruno.page.getByRole('button', { name: '🎤 Mute' })).toBeVisible()

  // Ana mutes on purpose before the conversation; Bruno stays unmuted.
  await muteButton(ana.page).click()
  await expect(ana.page.getByRole('button', { name: '🔇 Unmute' })).toBeVisible()

  // They meet in a private zone: the call moves to a private room and they talk for a few seconds.
  const desk = privateZoneCenter('desk-01')
  await teleport(ana.page, desk)
  await teleport(bruno.page, desk)
  await waitForRoom(ana.page, 'private')
  await waitForRoom(bruno.page, 'private')
  await expect(connectedTile(ana.page, 'Bruno')).toBeVisible()
  await ana.page.waitForTimeout(3_000)

  // Bruno walks out: the private call ends and both go back to the office.
  await teleport(bruno.page, OUTSIDE_ZONES)
  await waitForRoom(bruno.page, 'office')
  await ana.page.waitForTimeout(SETTLE_AFTER_ROOM_SWITCH_MS)

  await expect(bruno.page.getByRole('button', { name: '🎤 Mute' })).toBeVisible()
  await expect(ana.page.getByRole('button', { name: '🔇 Unmute' })).toBeVisible()
  await ana.context.close()
  await bruno.context.close()
})

// Issue #239: the microphone and camera stay on when the person leaves while a publish is still in
// flight, which is the case in the first moments after a private room connects.
test('leaving a private room as soon as its call is up keeps the microphone and camera on (issue #239)', async ({ browser }) => {
  const ana = await newPlayer(browser, 'Ana')
  const bruno = await newPlayer(browser, 'Bruno')
  await enterTheOffice(ana.page)
  await enterTheOffice(bruno.page)
  await cameraButton(bruno.page).click()
  await expect(bruno.page.getByRole('button', { name: '📷 Turn camera off' })).toBeVisible()

  const desk = privateZoneCenter('desk-01')
  await teleport(ana.page, desk)
  await teleport(bruno.page, desk)
  await waitForRoom(bruno.page, 'private')
  await teleport(bruno.page, OUTSIDE_ZONES)
  await waitForRoom(bruno.page, 'office')
  await bruno.page.waitForTimeout(SETTLE_AFTER_ROOM_SWITCH_MS)

  await expect(bruno.page.getByRole('button', { name: '🎤 Mute' })).toBeVisible()
  await expect(bruno.page.getByRole('button', { name: '📷 Turn camera off' })).toBeVisible()
  await ana.context.close()
  await bruno.context.close()
})

test('leaving a zone while its private room is still connecting keeps the microphone on (issue #239)', async ({ browser }) => {
  const ana = await newPlayer(browser, 'Ana')
  const bruno = await newPlayer(browser, 'Bruno')
  await enterTheOffice(ana.page)
  await enterTheOffice(bruno.page)

  const desk = privateZoneCenter('desk-01')
  await teleport(ana.page, desk)
  await teleport(bruno.page, desk)
  // Bruno already sees Ana (a proximity tile in the office) but the private room is not up yet.
  await expect(connectedTile(bruno.page, 'Ana')).toBeVisible()
  await teleport(bruno.page, OUTSIDE_ZONES)
  await bruno.page.waitForTimeout(SETTLE_AFTER_ROOM_SWITCH_MS)

  await waitForRoom(bruno.page, 'office')
  await expect(bruno.page.getByRole('button', { name: '🎤 Mute' })).toBeVisible()
  await ana.context.close()
  await bruno.context.close()
})

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
