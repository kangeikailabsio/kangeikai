import type { TiledTilesetRef } from '$lib/game/map/tileset-image-ref'
import { resolveTilesetImageRefs } from '$lib/game/map/tileset-image-ref'
import { describe, expect, it } from 'vitest'

describe('resolveTilesetImageRefs', () => {
  it('extracts the file basename from a relative image path', () => {
    const tilesets: TiledTilesetRef[] = [
      { name: 'Room_Builder_32x32', image: '../tiles/Room_Builder_32x32.png' },
    ]
    expect(resolveTilesetImageRefs(tilesets)).toEqual([
      { name: 'Room_Builder_32x32', basename: 'Room_Builder_32x32.png' },
    ])
  })

  it('extracts the basename from an absolute machine-local path', () => {
    const tilesets: TiledTilesetRef[] = [
      { name: 'Modern_Office_32x32', image: '/Volumes/SSD/tileds/Modern_Office_Revamped_v1/Modern_Office_32x32.png' },
    ]
    expect(resolveTilesetImageRefs(tilesets)).toEqual([
      { name: 'Modern_Office_32x32', basename: 'Modern_Office_32x32.png' },
    ])
  })

  it('handles multiple tilesets independently', () => {
    const tilesets: TiledTilesetRef[] = [
      { name: 'a', image: 'x/a.png' },
      { name: 'b', image: 'y/z/b.png' },
    ]
    expect(resolveTilesetImageRefs(tilesets)).toEqual([
      { name: 'a', basename: 'a.png' },
      { name: 'b', basename: 'b.png' },
    ])
  })

  it('returns an empty list for no tilesets', () => {
    expect(resolveTilesetImageRefs([])).toEqual([])
  })
})
