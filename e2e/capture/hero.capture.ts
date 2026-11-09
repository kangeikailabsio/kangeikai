import { test } from '@playwright/test'
import { teleport, walkTo } from '../support/game'
import { LOOKS } from './support/looks'
import { closeActor, enter, expectApart, finishClip, newActor, waitForNoTiles, waitForPeople, zoomIn } from './support/recording'

// A short tour: out of the meeting room and along the desks, with colleagues working on the way. Nobody shares a private
// zone with the one walking, so no call starts and the office just looks lived in.
test('hero', async ({ browser }) => {
  const ana = await newActor(browser, 'Ana', LOOKS.ana, 'hero')
  const bruno = await newActor(browser, 'Bruno', LOOKS.bruno)
  const clara = await newActor(browser, 'Clara', LOOKS.clara)
  const davi = await newActor(browser, 'Davi', LOOKS.davi)
  await Promise.all([enter(ana), enter(bruno), enter(clara), enter(davi)])

  await teleport(bruno.page, { x: 1130, y: 470 })
  await teleport(clara.page, { x: 900, y: 475 })
  await teleport(davi.page, { x: 610, y: 470 })
  await teleport(ana.page, { x: 1590, y: 300 })
  await zoomIn(ana.page)
  await waitForPeople(ana, 4)
  await expectApart(ana, bruno, 130)
  await waitForNoTiles(ana)

  const startMs = ana.elapsed()
  await ana.page.waitForTimeout(700)
  await walkTo(ana.page, { x: 1130, y: 565 })
  await walkTo(ana.page, { x: 520, y: 565 })
  await ana.page.waitForTimeout(700)
  const endMs = ana.elapsed()

  await Promise.all([closeActor(bruno), closeActor(clara), closeActor(davi)])
  await finishClip(ana, { clip: 'hero', startMs, endMs, posterMs: 4_500 })
})
