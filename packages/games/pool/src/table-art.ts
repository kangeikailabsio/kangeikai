/**
 * Bakes everything that never changes into textures, drawn once at scene creation.
 *
 * Phaser 4's `Graphics` is immediate-mode: `clear()` only truncates the command buffer and the whole
 * buffer is re-tessellated on every render pass, with arcs at a fixed 100 segments each allocating a
 * point. The table furniture and the balls never change shape, so re-tessellating them every frame
 * was pure waste. A 2D canvas texture also buys real gradients and shadows, which `Graphics` cannot
 * express — that is what makes the floor and its fade to black possible at all.
 */
import type Phaser from 'phaser'
import { BALL_NUMBER_INK, BALL_NUMBER_PATCH, ballBodyHue, ballHue, toCssHex } from '@kangeikai/game-pool/core'
import { FLOOR_EDGE, FLOOR_WOOD, planks, seededRandom, shadeCss } from '@kangeikai/game-pool/floor'
import { BALL_RADIUS, POCKET_RADIUS, POCKETS, TABLE_HEIGHT, TABLE_WIDTH } from '@kangeikai/game-pool/physics'

/** Fixed so the floor looks the same every time the table is opened. */
const FLOOR_SEED = 20260911

export interface TableArtLayout {
  canvasWidth: number
  canvasHeight: number
  /** The table furniture block (wood body outer edge). */
  frame: { x: number, y: number, width: number, height: number }
  /** Playfield origin in canvas space. */
  origin: { x: number, y: number }
  /** Height of the fade from the floor up to a flat FLOOR_EDGE band. */
  fadeHeight: number
}

/** Ball art is drawn into a box this wide, leaving room for the drop shadow. */
const BALL_TEXTURE_SIZE = 32
const BALL_CENTER = BALL_TEXTURE_SIZE / 2

function drawFloor(context: CanvasRenderingContext2D, layout: TableArtLayout): void {
  const { canvasWidth: width, canvasHeight: height } = layout
  context.fillStyle = toCssHex(FLOOR_EDGE)
  context.fillRect(0, 0, width, height)

  for (const plank of planks({ width, height, random: seededRandom(FLOOR_SEED) })) {
    context.fillStyle = shadeCss(FLOOR_WOOD, plank.shade)
    context.fillRect(plank.x, plank.y, plank.width, plank.height)
    // Grain, then a dark seam on the trailing edges and a highlight on the leading one, so each
    // board reads as a separate piece of wood rather than a flat rectangle.
    context.strokeStyle = 'rgba(0, 0, 0, 0.05)'
    context.lineWidth = 1
    for (let i = 1; i <= 3; i++) {
      const y = plank.y + (plank.height * i) / 4
      context.beginPath()
      context.moveTo(plank.x, y)
      context.lineTo(plank.x + plank.width, y)
      context.stroke()
    }
    context.fillStyle = 'rgba(0, 0, 0, 0.28)'
    context.fillRect(plank.x + plank.width - 1, plank.y, 1, plank.height)
    context.fillRect(plank.x, plank.y + plank.height - 1, plank.width, 1)
    context.fillStyle = 'rgba(255, 255, 255, 0.05)'
    context.fillRect(plank.x, plank.y, plank.width, 1)
  }
}

function drawFade(context: CanvasRenderingContext2D, layout: TableArtLayout): void {
  const { canvasWidth: width, fadeHeight } = layout
  // The top of the fade is *flat* FLOOR_EDGE, not still in transition. That is what lets the DOM
  // panel's gradient end on the same colour and make the seam invisible at any panel height.
  const fade = context.createLinearGradient(0, 0, 0, fadeHeight)
  fade.addColorStop(0, toCssHex(FLOOR_EDGE))
  fade.addColorStop(1, `${toCssHex(FLOOR_EDGE)}00`)
  context.fillStyle = fade
  context.fillRect(0, 0, width, fadeHeight)
}

function drawVignette(context: CanvasRenderingContext2D, layout: TableArtLayout): void {
  const { canvasWidth: width, canvasHeight: height } = layout
  const depth = 48
  const edge = toCssHex(FLOOR_EDGE)
  const sides: [number, number, number, number, [number, number, number, number]][] = [
    [0, 0, depth, height, [0, 0, depth, 0]],
    [width - depth, 0, depth, height, [width, 0, width - depth, 0]],
    [0, height - depth, width, depth, [0, height, 0, height - depth]],
  ]
  for (const [x, y, w, h, [gx0, gy0, gx1, gy1]] of sides) {
    const gradient = context.createLinearGradient(gx0, gy0, gx1, gy1)
    gradient.addColorStop(0, edge)
    gradient.addColorStop(1, `${edge}00`)
    context.fillStyle = gradient
    context.fillRect(x, y, w, h)
  }
}

function drawTable(context: CanvasRenderingContext2D, layout: TableArtLayout): void {
  const { frame, origin } = layout
  // Ambient occlusion under the table, so it sits on the floor instead of floating.
  context.save()
  context.shadowColor = 'rgba(0, 0, 0, 0.75)'
  context.shadowBlur = 28
  context.shadowOffsetY = 10
  context.fillStyle = '#000000'
  context.beginPath()
  context.roundRect(frame.x, frame.y, frame.width, frame.height, 28)
  context.fill()
  context.restore()

  context.fillStyle = '#533c2b'
  context.beginPath()
  context.roundRect(frame.x, frame.y, frame.width, frame.height, 28)
  context.fill()

  context.strokeStyle = '#b18b59'
  context.lineWidth = 3
  context.beginPath()
  context.roundRect(frame.x + 6, frame.y + 6, frame.width - 12, frame.height - 12, 24)
  context.stroke()

  context.fillStyle = '#103d32'
  context.beginPath()
  context.roundRect(frame.x + 20, frame.y + 20, frame.width - 40, frame.height - 40, 14)
  context.fill()

  context.fillStyle = '#206e58'
  context.fillRect(origin.x, origin.y, TABLE_WIDTH, TABLE_HEIGHT)

  context.strokeStyle = 'rgba(255, 255, 255, 0.14)'
  context.lineWidth = 1
  context.beginPath()
  context.moveTo(origin.x + 200, origin.y)
  context.lineTo(origin.x + 200, origin.y + TABLE_HEIGHT)
  context.stroke()

  for (const pocket of POCKETS) {
    const x = origin.x + pocket.x
    const y = origin.y + pocket.y
    context.fillStyle = '#b89865'
    context.beginPath()
    context.arc(x, y, POCKET_RADIUS + 5, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#071b17'
    context.beginPath()
    context.arc(x, y, POCKET_RADIUS, 0, Math.PI * 2)
    context.fill()
  }
}

/** One Image replacing the ~19 shapes that used to be re-tessellated every frame. */
export function createStaticLayer(scene: Phaser.Scene, layout: TableArtLayout): Phaser.GameObjects.Image {
  const key = `pool-table-${scene.sys.settings.key}`
  scene.textures.remove(key)
  const texture = scene.textures.createCanvas(key, layout.canvasWidth, layout.canvasHeight)!
  const context = texture.context
  drawFloor(context, layout)
  drawFade(context, layout)
  drawVignette(context, layout)
  drawTable(context, layout)
  texture.refresh()
  return scene.add.image(0, 0, key).setOrigin(0).setDepth(0)
}

/**
 * One texture per ball id, with shadow, body, stripe band, number patch and the number itself baked
 * in — which also removes the 15 `Text` objects that were repositioned every frame.
 *
 * Generated at 1x logical size and left on LINEAR filtering: `Scale.FIT` is CSS-only (the backing
 * store stays at the configured canvas size), so rendering is pixel-exact here and the browser's
 * uniform downscale dominates. NEAREST would jag these smooth-shaded circles and make them jitter
 * at sub-pixel positions.
 */
export function createBallTextures(scene: Phaser.Scene): (id: number) => string {
  const prefix = `pool-ball-${scene.sys.settings.key}`
  for (let id = 0; id <= 15; id++) {
    const key = `${prefix}-${id}`
    scene.textures.remove(key)
    const texture = scene.textures.createCanvas(key, BALL_TEXTURE_SIZE, BALL_TEXTURE_SIZE)!
    const context = texture.context

    context.fillStyle = 'rgba(0, 0, 0, 0.25)'
    context.beginPath()
    context.arc(BALL_CENTER + 2, BALL_CENTER + 3, BALL_RADIUS + 1, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = toCssHex(ballBodyHue(id))
    context.beginPath()
    context.arc(BALL_CENTER, BALL_CENTER, BALL_RADIUS, 0, Math.PI * 2)
    context.fill()

    if (id > 8) {
      context.save()
      // Clipped to the body so the band cannot spill past the silhouette.
      context.beginPath()
      context.arc(BALL_CENTER, BALL_CENTER, BALL_RADIUS, 0, Math.PI * 2)
      context.clip()
      context.fillStyle = toCssHex(ballHue(id))
      context.beginPath()
      context.ellipse(BALL_CENTER, BALL_CENTER, BALL_RADIUS, 6, 0, 0, Math.PI * 2)
      context.fill()
      context.restore()
    }

    if (id !== 0) {
      context.fillStyle = toCssHex(BALL_NUMBER_PATCH)
      context.beginPath()
      context.arc(BALL_CENTER, BALL_CENTER, 5.5, 0, Math.PI * 2)
      context.fill()
      context.fillStyle = toCssHex(BALL_NUMBER_INK)
      context.font = 'bold 9px Arial'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText(String(id), BALL_CENTER, BALL_CENTER + 0.5)
    }

    context.fillStyle = 'rgba(255, 255, 255, 0.35)'
    context.beginPath()
    context.arc(BALL_CENTER - 4, BALL_CENTER - 4, 2, 0, Math.PI * 2)
    context.fill()

    texture.refresh()
  }
  return (id: number) => `${prefix}-${id}`
}
