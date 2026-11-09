import type { Browser, BrowserContext, Page } from '@playwright/test'
import type { Look } from './looks'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'
import { newAccount } from '../../support/accounts'
import { CLIENT_URL, SERVER_URL } from '../../support/env'
import { enterTheOffice, leaveOffice, position } from '../../support/game'

/** 16:9, like the placeholders on the landing page. */
export const CLIP_SIZE = { width: 1280, height: 720 }

export const RAW_DIR = fileURLToPath(new URL('../../capture-output/raw/', import.meta.url))

export interface Actor {
  name: string
  context: BrowserContext
  page: Page
  /** Milliseconds since the page (and its recording, if any) was created. */
  elapsed: () => number
}

/**
 * A signed-in person with a fixed look. Only the actor made with `record` is filmed: the camera
 * follows their avatar, so the others are seen from their point of view.
 */
export async function newActor(browser: Browser, name: string, look: Look, record?: string): Promise<Actor> {
  mkdirSync(RAW_DIR, { recursive: true })
  const context = await browser.newContext({
    permissions: ['microphone', 'camera'],
    viewport: CLIP_SIZE,
    deviceScaleFactor: 1,
    ...(record ? { recordVideo: { dir: `${RAW_DIR}${record}-tmp`, size: CLIP_SIZE } } : {}),
  })
  const account = newAccount(name)
  const headers = { Origin: CLIENT_URL }
  const signUp = await context.request.post(`${SERVER_URL}/api/auth/sign-up/email`, { headers, data: { name: account.name, email: account.email, password: account.password } })
  expect(signUp.ok(), `sign up ${account.email}`).toBe(true)
  const profile = await context.request.put(`${SERVER_URL}/api/profile`, { headers, data: { displayName: name, spriteType: look.spriteType, characterSelection: look.selection } })
  expect(profile.ok(), `profile of ${name}`).toBe(true)

  const page = await context.newPage()
  const createdAt = Date.now()
  return { name, context, page, elapsed: () => Date.now() - createdAt }
}

export const enter = (actor: Actor) => enterTheOffice(actor.page)

export interface ClipMeta {
  /** Name of the output files. */
  clip: string
  /** Where the scene starts and ends in the recording, in ms (everything before is the sign-in and loading). */
  startMs: number
  endMs: number
  /** Which moment, after `startMs`, becomes the poster image. */
  posterMs: number
  /** Optional crop of the recording, in px, scaled back up to the clip size. */
  crop?: { x: number, y: number, width: number, height: number }
}

/** Closes the recorded actor's context (which finishes the video) and keeps the recording and its timing. */
export async function finishClip(actor: Actor, meta: ClipMeta): Promise<void> {
  const video = actor.page.video()
  if (!video)
    throw new Error('this actor was not recording')
  await leaveOffice(actor.page)
  await actor.context.close()
  await video.saveAs(`${RAW_DIR}${meta.clip}.webm`)
  writeFileSync(`${RAW_DIR}${meta.clip}.json`, `${JSON.stringify(meta, null, 2)}\n`)
}

/** The game's own zoom (scroll wheel), at its closest: avatars are tiny at the default zoom, unreadable in a short clip. */
export async function zoomIn(page: Page): Promise<void> {
  await page.mouse.move(CLIP_SIZE.width / 2, CLIP_SIZE.height / 2)
  await page.mouse.wheel(0, -2_000)
  await page.waitForTimeout(900) // the camera eases to the new zoom
}

/**
 * Waits until the members list shows exactly `count` people, then closes it again (call before the
 * scene starts, so it is cut from the clip). People from an earlier clip stay in the room for a while after their
 * browser closes (the server keeps a session for 15 s to allow a reconnection), and would show up as tiles.
 */
export async function waitForPeople(actor: Actor, count: number): Promise<void> {
  const members = actor.page.getByRole('button', { name: /Members/ })
  await members.click()
  await expect(actor.page.getByText(`Members (${count})`)).toBeVisible({ timeout: 45_000 })
  await members.click()
}

/** Fails when the staged avatars are closer than `minPx`: the scene would start with tiles already on screen, or not at all as planned. */
export async function expectApart(a: Actor, b: Actor, minPx: number): Promise<void> {
  const [first, second] = await Promise.all([position(a.page), position(b.page)])
  const distance = Math.hypot(first.x - second.x, first.y - second.y)
  if (distance < minPx)
    throw new Error(`${a.name} and ${b.name} are ${Math.round(distance)} px apart; this scene needs at least ${minPx}`)
}

/** Leaves the office cleanly and closes the actor's browser; use for everyone who is not filmed. */
export async function closeActor(actor: Actor): Promise<void> {
  await leaveOffice(actor.page)
  await actor.context.close()
}

/**
 * Waits for the video tiles to disappear: the scene must start with nobody close enough to be heard, so the tiles
 * that appear later are the point of the clip. Everyone is spawned at the same spot, so right after joining they all
 * count as nearby until the proximity state catches up with the teleports.
 */
export async function waitForNoTiles(actor: Actor): Promise<void> {
  await expect(actor.page.locator('.tile')).toHaveCount(0, { timeout: 20_000 })
}
