import type { AvatarDirection } from '@kangeikai/shared'
import { AVATAR_FRAME_RANGES } from '$lib/game/entities/avatar'

const FRAME_WIDTH = 32
const FRAME_HEIGHT = 64

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load spritesheet for portrait extraction: ${url}`))
    image.src = url
  })
}

/**
 * A single 32×64 frame — `direction`'s first idle frame — cropped out of a composed idle sheet.
 * Used for still-image previews (the login screen's thumbnail, the creator modal's rotate
 * control) instead of embedding a live Phaser canvas just to show one pose (issue #168's design
 * decision: static preview, not animated).
 */
export async function extractPortrait(idleSheetDataUrl: string, direction: AvatarDirection): Promise<string> {
  const image = await loadImage(idleSheetDataUrl)
  const frameX = AVATAR_FRAME_RANGES[direction].start * FRAME_WIDTH

  const canvas = document.createElement('canvas')
  canvas.width = FRAME_WIDTH
  canvas.height = FRAME_HEIGHT
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('2D canvas context unavailable')

  context.drawImage(image, frameX, 0, FRAME_WIDTH, FRAME_HEIGHT, 0, 0, FRAME_WIDTH, FRAME_HEIGHT)
  return canvas.toDataURL('image/png')
}
