import { test } from '@playwright/test'
import { teleport, waitForRoom, walkTo } from '../support/game'
import { privateZoneCenter } from '../support/zones'
import { LOOKS } from './support/looks'
import { closeActor, enter, expectApart, finishClip, newActor, waitForNoTiles, waitForPeople, zoomIn } from './support/recording'

// Two people step into a private zone and the call moves into a room of its own.
test('private-rooms', async ({ browser }) => {
  const ana = await newActor(browser, 'Ana', LOOKS.ana, 'private-rooms')
  const bruno = await newActor(browser, 'Bruno', LOOKS.bruno)
  await Promise.all([enter(ana), enter(bruno)])

  const desk = privateZoneCenter('desk-01')
  await teleport(ana.page, { x: desk.x + 230, y: desk.y + 120 })
  await teleport(bruno.page, { x: desk.x + 340, y: desk.y + 170 })
  await zoomIn(ana.page)
  await waitForPeople(ana, 2)
  await expectApart(ana, bruno, 110)
  await waitForNoTiles(ana)

  const startMs = ana.elapsed()
  await ana.page.waitForTimeout(800)
  await walkTo(ana.page, desk)
  await walkTo(bruno.page, { x: desk.x + 14, y: desk.y + 6 })
  await waitForRoom(ana.page, 'private')
  await ana.page.waitForTimeout(3_200)
  const endMs = ana.elapsed()

  await closeActor(bruno)
  await finishClip(ana, { clip: 'private-rooms', startMs, endMs, posterMs: endMs - startMs - 600 })
})
