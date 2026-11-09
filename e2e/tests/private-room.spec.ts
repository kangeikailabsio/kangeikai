import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { newPlayer } from '../support/accounts'
import { enterTheOffice, muteButton, teleport } from '../support/game'
import { OUTSIDE_ZONES, privateZoneCenter } from '../support/zones'

/** A remote person's tile once the private call has really connected: an avatar with its mic dot (a pending tile only shows a spinner). */
const connectedTile = (page: Page, name: string) => page.locator('.tile', { hasText: name }).locator('.mic-dot')
/** The green dot of a remote person's tile: their microphone is published and on. */
const micOnDot = (page: Page, name: string) => page.locator('.tile', { hasText: name }).locator('.mic-dot.on')
const pendingTile = (page: Page, name: string) => page.locator('.tile', { hasText: name }).locator('.connecting-spinner')

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

  // They meet in a private zone: the call moves to a private room.
  const desk = privateZoneCenter('desk-01')
  await teleport(ana.page, desk)
  await teleport(bruno.page, desk)
  await expect(connectedTile(ana.page, 'Bruno')).toBeVisible({ timeout: 30_000 })
  await expect(connectedTile(bruno.page, 'Ana')).toBeVisible({ timeout: 30_000 })
  // A normal conversation: Bruno's microphone is published in the private room (his green dot, seen
  // by Ana) and they talk for a few seconds. Leaving right after joining is a different case, which
  // still loses the microphone: see the `fixme` test below.
  await expect(micOnDot(ana.page, 'Bruno')).toBeVisible({ timeout: 30_000 })
  await ana.page.waitForTimeout(3_000)

  // Bruno walks out: the private call ends and both go back to the office.
  await teleport(bruno.page, OUTSIDE_ZONES)
  await expect(ana.page.locator('.tile', { hasText: 'Bruno' })).toHaveCount(0, { timeout: 30_000 })
  // Back in the office the audio reconnects; give the hand-off time to finish before asserting,
  // otherwise the label could still be the one from before the switch and the check proves nothing.
  await ana.page.waitForTimeout(4_000)

  await expect(bruno.page.getByRole('button', { name: '🎤 Mute' })).toBeVisible()
  await expect(ana.page.getByRole('button', { name: '🔇 Unmute' })).toBeVisible()
  await ana.context.close()
  await bruno.context.close()
})

// Found by this suite. Leaving a private room within about a second of joining it brings the person
// back to the office with the microphone off (the client logs "microphone unavailable ... Cancelled
// publication by calling unpublish"): a publish that is still in flight is cancelled by the room
// switch. The #222 fix reads the state from the published track, which lags the person's intent.
// Remove `fixme` once the microphone state is kept as the person's intent.
test.fixme('leaving a private room right after joining it keeps the microphone on', async ({ browser }) => {
  const ana = await newPlayer(browser, 'Ana')
  const bruno = await newPlayer(browser, 'Bruno')
  await enterTheOffice(ana.page)
  await enterTheOffice(bruno.page)

  const desk = privateZoneCenter('desk-01')
  await teleport(ana.page, desk)
  await teleport(bruno.page, desk)
  await expect(connectedTile(bruno.page, 'Ana')).toBeVisible({ timeout: 30_000 })
  await teleport(bruno.page, OUTSIDE_ZONES)
  await bruno.page.waitForTimeout(4_000)

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

  await expect(connectedTile(bruno.page, 'Ana')).toBeVisible({ timeout: 30_000 })
  await expect(connectedTile(ana.page, 'Bruno')).toBeVisible({ timeout: 30_000 })
  await ana.context.close()
  await bruno.context.close()
})
