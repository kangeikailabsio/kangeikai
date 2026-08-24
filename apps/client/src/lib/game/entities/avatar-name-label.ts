import type Phaser from 'phaser'

const LABEL_OFFSET_Y = 40
const LABEL_HORIZONTAL_PADDING = 9
const LABEL_VERTICAL_PADDING = 5
const LABEL_CORNER_RADIUS = 4
const LABEL_ARROW_WIDTH = 10
const LABEL_ARROW_HEIGHT = 5
const LABEL_DEPTH = 10_000

/**
 * Persistent identity label anchored above an avatar. Keeping the visual composition in a
 * container leaves room for status indicators to be added alongside the name later.
 */
export class AvatarNameLabel {
  private readonly container: Phaser.GameObjects.Container

  constructor(scene: Phaser.Scene, x: number, y: number, text: string) {
    const name = scene.add.text(0, 0, text, {
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif',
      fontSize: '11px',
    }).setOrigin(0.5)

    const width = name.width + LABEL_HORIZONTAL_PADDING * 2
    const height = name.height + LABEL_VERTICAL_PADDING * 2
    const background = scene.add.graphics()
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

    this.container = scene.add.container(x, y - LABEL_OFFSET_Y, [background, name])
      .setDepth(LABEL_DEPTH)
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y - LABEL_OFFSET_Y)
  }

  destroy(): void {
    this.container.destroy(true)
  }
}
