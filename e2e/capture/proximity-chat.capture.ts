import { test } from '@playwright/test'
import { teleport, walkTo } from '../support/game'
import { LOOKS } from './support/looks'
import { closeActor, enter, expectApart, finishClip, newActor, waitForNoTiles, waitForPeople, zoomIn } from './support/recording'

// Voice and video follow distance: walk up to someone and their tile appears. On the open floor between the desks and the
// living room, which is in no private zone (inside one, everybody is in the same call whatever the distance).
test('proximity-chat', async ({ browser }) => {
  const ana = await newActor(browser, 'Ana', LOOKS.ana, 'proximity-chat')
  const bruno = await newActor(browser, 'Bruno', LOOKS.bruno)
  const clara = await newActor(browser, 'Clara', LOOKS.clara)
  await Promise.all([enter(ana), enter(bruno), enter(clara)])

  // Everyone starts beyond the 80 px hearing range.
  await teleport(ana.page, { x: 700, y: 560 })
  await teleport(bruno.page, { x: 910, y: 505 })
  await teleport(clara.page, { x: 530, y: 610 })
  await zoomIn(ana.page)
  await waitForPeople(ana, 3)
  await expectApart(ana, bruno, 150)
  await expectApart(ana, clara, 150)
  await waitForNoTiles(ana)

  const startMs = ana.elapsed()
  await ana.page.waitForTimeout(1_200)
  await walkTo(bruno.page, { x: 752, y: 540 })
  await ana.page.waitForTimeout(2_200)
  await walkTo(clara.page, { x: 650, y: 590 })
  await ana.page.waitForTimeout(2_600)
  const endMs = ana.elapsed()

  await Promise.all([closeActor(bruno), closeActor(clara)])
  await finishClip(ana, { clip: 'proximity-chat', startMs, endMs, posterMs: 5_000 })
})
