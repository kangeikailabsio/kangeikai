import { test } from '@playwright/test'
import { teleport, walkTo } from '../support/game'
import { LOOKS } from './support/looks'
import { closeActor, enter, expectApart, finishClip, newActor, waitForNoTiles, waitForPeople, zoomIn } from './support/recording'

// People around the same office: one walks through it, passing others who are working and one who crosses the other way.
test('shared-map', async ({ browser }) => {
  const ana = await newActor(browser, 'Ana', LOOKS.ana, 'shared-map')
  const bruno = await newActor(browser, 'Bruno', LOOKS.bruno)
  const clara = await newActor(browser, 'Clara', LOOKS.clara)
  const davi = await newActor(browser, 'Davi', LOOKS.davi)
  await Promise.all([enter(ana), enter(bruno), enter(clara), enter(davi)])

  await teleport(ana.page, { x: 420, y: 585 })
  await teleport(bruno.page, { x: 600, y: 480 })
  await teleport(clara.page, { x: 800, y: 470 })
  await teleport(davi.page, { x: 1060, y: 520 })
  await zoomIn(ana.page)
  await waitForPeople(ana, 4)
  await expectApart(ana, davi, 300)
  await waitForNoTiles(ana)

  const startMs = ana.elapsed()
  await Promise.all([
    walkTo(ana.page, { x: 1010, y: 585 }),
    walkTo(davi.page, { x: 560, y: 520 }),
  ])
  await ana.page.waitForTimeout(700)
  const endMs = ana.elapsed()

  await Promise.all([closeActor(bruno), closeActor(clara), closeActor(davi)])
  await finishClip(ana, { clip: 'shared-map', startMs, endMs, posterMs: 1_200 })
})
