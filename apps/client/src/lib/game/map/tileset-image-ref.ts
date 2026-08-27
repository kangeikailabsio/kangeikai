export interface TiledTilesetRef {
  name: string
  image: string
}

export interface TilesetImageRef {
  name: string
  basename: string
}

/**
 * Tiled writes each tileset's `image` as a path relative to wherever the map author's `.tiled`
 * project lived on their machine — often not reproducible in this repo (e.g. map.tmj's
 * `../../../../../../../../../../../../Volumes/SSD/tileds/...` entries). Only the filename is
 * meaningful here: assets are resolved by basename within the active map's own folder.
 */
export function resolveTilesetImageRefs(tilesets: readonly TiledTilesetRef[]): TilesetImageRef[] {
  return tilesets.map(({ name, image }) => ({
    name,
    basename: image.split('/').pop() ?? image,
  }))
}
