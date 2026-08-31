import type { AvatarPresence } from '@kangeikai/shared'
import type Phaser from 'phaser'

const LABEL_OFFSET_Y = 40
const LABEL_HORIZONTAL_PADDING = 9
const LABEL_VERTICAL_PADDING = 5
const LABEL_CORNER_RADIUS = 4
const LABEL_ARROW_WIDTH = 10
const LABEL_ARROW_HEIGHT = 5
const LABEL_DEPTH = 10_000
const LABEL_BUSY_DOT_COLOR = 0xFBBF24
const LABEL_BUSY_DOT_RADIUS = 3
const LABEL_BUSY_DOT_GAP = 5

/**
 * Persistent identity label anchored above an avatar. Keeping the visual composition in a
 * container lets the busy indicator sit alongside the name: an amber dot drawn into the same
 * `Graphics` as the pill, so presence changes never create or destroy game objects.
 */
export class AvatarNameLabel {
  private readonly container: Phaser.GameObjects.Container
  private readonly background: Phaser.GameObjects.Graphics
  private readonly name: Phaser.GameObjects.Text
  private presence: AvatarPresence = 'available'

  constructor(scene: Phaser.Scene, x: number, y: number, text: string) {
    this.name = scene.add.text(0, 0, text, {
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontSize: '11px',
    }).setOrigin(0.5)
    this.background = scene.add.graphics()
    this.redraw()

    this.container = scene.add.container(x, y - LABEL_OFFSET_Y, [this.background, this.name])
      .setDepth(LABEL_DEPTH)
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y - LABEL_OFFSET_Y)
  }

  setPresence(presence: AvatarPresence): void {
    if (presence === this.presence) {
      return
    }
    this.presence = presence
    this.redraw()
  }

  /**
   * Rebuilds the whole pill: `Graphics.clear()` also wipes the arrow, so the rounded rect, the
   * arrow and the busy dot are always drawn together, sized to the current content.
   */
  private redraw(): void {
    const busy = this.presence === 'busy'
    const contentWidth = this.name.width + (busy ? LABEL_BUSY_DOT_RADIUS * 2 + LABEL_BUSY_DOT_GAP : 0)
    const width = contentWidth + LABEL_HORIZONTAL_PADDING * 2
    const height = this.name.height + LABEL_VERTICAL_PADDING * 2
    this.name.setX(contentWidth / 2 - this.name.width / 2)

    this.background
      .clear()
      .fillStyle(0x111827, 0.88)
      .fillRoundedRect(-width / 2, -height / 2, width, height, LABEL_CORNER_RADIUS)
      .fillTriangle(
        -LABEL_ARROW_WIDTH / 2,
        height / 2 - 1,
        LABEL_ARROW_WIDTH / 2,
        height / 2 - 1,
        0,
        height / 2 + LABEL_ARROW_HEIGHT,
      )

    if (busy) {
      this.background
        .fillStyle(LABEL_BUSY_DOT_COLOR)
        .fillCircle(-contentWidth / 2 + LABEL_BUSY_DOT_RADIUS, 0, LABEL_BUSY_DOT_RADIUS)
    }
  }

  destroy(): void {
    this.container.destroy(true)
  }
}
