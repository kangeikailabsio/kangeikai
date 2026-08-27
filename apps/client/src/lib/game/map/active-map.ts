import type Phaser from 'phaser'
import type { TiledTilesetRef } from './tileset-image-ref'
import { resolveTilesetImageRefs } from './tileset-image-ref'

/**
 * Folder name (under `$lib/assets/maps/`) of the map currently wired into the scene. Swapping
 * the active map — e.g. `welcome` → a future `beach` — is this one line; nothing else in
 * preload needs to change, since every asset below is resolved dynamically by folder/basename.
 */
export const ACTIVE_MAP_NAME = 'welcome'

interface TiledMapJson {
  tilesets: TiledTilesetRef[]
}

export interface ActiveMapHandle {
  /** Phaser tilemap key to pass to `this.make.tilemap({ key })` in `create()`. */
  key: string
}

// `eager: true` resolves these at build time into plain string maps (module path -> content/
// URL) — no async loading step needed before `preload()` can queue files. The glob covers every
// map folder, not just the active one, so nothing here needs to change when a new map is added.
const mapJsonSources = import.meta.glob('../../assets/maps/*/map.tmj', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const mapJsonUrls = import.meta.glob('../../assets/maps/*/map.tmj', { query: '?url', import: 'default', eager: true }) as Record<string, string>
const tilesetImageUrls = import.meta.glob('../../assets/maps/*/*.png', { query: '?url', import: 'default', eager: true }) as Record<string, string>

function findByMapFolder<T>(modules: Record<string, T>, mapName: string, suffix = ''): T {
  const entry = Object.entries(modules).find(([path]) => path.includes(`/maps/${mapName}/`) && path.endsWith(suffix))
  if (!entry) {
    throw new Error(`kangeikai: no asset matching "${suffix || '*'}" found for map "${mapName}"`)
  }
  return entry[1]
}

/**
 * Queues the active map's Tiled JSON and every tileset image it references onto the scene's
 * loader — call from `preload()`. Tileset images are matched by filename (see
 * `resolveTilesetImageRefs`), not by the raw path Tiled wrote into the JSON.
 */
export function queueActiveMapLoad(scene: Phaser.Scene): ActiveMapHandle {
  const mapName = ACTIVE_MAP_NAME

  scene.load.tilemapTiledJSON(mapName, findByMapFolder(mapJsonUrls, mapName, '.tmj'))

  const mapJson = JSON.parse(findByMapFolder(mapJsonSources, mapName, '.tmj')) as TiledMapJson
  for (const { name, basename } of resolveTilesetImageRefs(mapJson.tilesets)) {
    scene.load.image(name, findByMapFolder(tilesetImageUrls, mapName, `/${basename}`))
  }

  return { key: mapName }
}
