import type { GameTable } from '@kangeikai/shared'
import type Phaser from 'phaser'

/** A soft halo from the table artwork's alpha, placed immediately behind its tile layer. */
export class TableGlow {
  private readonly image: Phaser.GameObjects.Image
  private readonly textureKey: string
  private active = false

  constructor(private readonly scene: Phaser.Scene, layer: Phaser.Tilemaps.TilemapLayer, table: GameTable) {
    const padding = 20
    const width = table.width + padding * 2
    const height = table.height + padding * 2
    this.textureKey = `table-glow-${scene.sys.settings.key}-${table.id}`
    const silhouette = document.createElement('canvas')
    silhouette.width = width
    silhouette.height = height
    const mask = silhouette.getContext('2d')!
    // Preserve transparent pixels, irregular edges, legs and flipped tiles from the actual art.
    for (const tile of layer.getTilesWithin(undefined, undefined, undefined, undefined, { isNotEmpty: true })) {
      const tileset = tile.tileset
      const source = tileset?.image?.getSourceImage()
      const coordinates = tileset?.getTileTextureCoordinates(tile.index) as { x: number, y: number } | null
      if (!tileset || !coordinates || !(source instanceof HTMLImageElement || source instanceof HTMLCanvasElement))
        continue
      mask.save()
      mask.translate(tile.pixelX + layer.x - table.x + padding + tileset.tileWidth / 2, tile.pixelY + layer.y - table.y + padding + tileset.tileHeight / 2)
      mask.rotate(tile.rotation)
      mask.scale(tile.flipX ? -1 : 1, tile.flipY ? -1 : 1)
      mask.globalAlpha = tile.alpha
      mask.drawImage(source, coordinates.x, coordinates.y, tileset.tileWidth, tileset.tileHeight, -tileset.tileWidth / 2, -tileset.tileHeight / 2, tileset.tileWidth, tileset.tileHeight)
      mask.restore()
    }
    mask.globalCompositeOperation = 'source-in'
    mask.fillStyle = '#ffdc70'
    mask.fillRect(0, 0, width, height)

    const texture = scene.textures.createCanvas(this.textureKey, width, height)!
    const context = texture.context
    context.shadowColor = 'rgba(255, 213, 73, 1)'
    context.shadowBlur = 14
    context.shadowOffsetY = 2
    context.drawImage(silhouette, 0, 0)
    // A concentrated second pass makes the light readable against the bright floor tiles.
    context.shadowBlur = 5
    context.drawImage(silhouette, 0, 0)
    // Keep only the diffuse light outside the silhouette; no solid stroke or yellow recoloring.
    context.shadowColor = 'transparent'
    context.globalCompositeOperation = 'destination-out'
    context.drawImage(silhouette, 0, 0)
    context.globalCompositeOperation = 'source-over'
    texture.refresh()

    this.image = scene.add.image(table.x - padding, table.y - padding, this.textureKey)
      .setOrigin(0)
      .setDepth(layer.depth)
      .setAlpha(0)
    scene.children.moveBelow(this.image, layer)
  }

  setActive(active: boolean): void {
    if (active === this.active)
      return
    this.active = active
    this.scene.tweens.killTweensOf(this.image)
    this.scene.tweens.add({ targets: this.image, alpha: active ? 0.95 : 0, duration: 150 })
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.image)
    this.image.destroy()
    this.scene.textures.remove(this.textureKey)
  }
}
