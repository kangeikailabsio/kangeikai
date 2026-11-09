import type { CollisionRect, PrivateZone, RespawnRect, TiledSpaceObject } from '@kangeikai/shared'
import { readFileSync } from 'node:fs'
import { resolveGameTables, resolvePrivateZones } from '@kangeikai/shared'

interface TiledLayer {
  name: string
  objects?: TiledSpaceObject[]
}

interface TiledMapJson {
  layers: TiledLayer[]
  width: number
  height: number
  tilewidth: number
  tileheight: number
}

/**
 * Same physical file `apps/client`'s Vite build reads (`active-map.ts`) — lives in
 * `packages/shared`, not either app, specifically so there's one source of truth for zone
 * geometry between what the client renders and what the server authorizes against (issue #60).
 * `src/map-zones.ts` (dev, via tsx) and the esbuild-bundled `dist/index.js` (prod, `build.mjs`)
 * are both direct children of `apps/server/`, so this relative path resolves the same from
 * either.
 */
const MAP_PATH = new URL('../../../packages/shared/assets/maps/welcome/map.tmj', import.meta.url)

const mapJson = JSON.parse(readFileSync(MAP_PATH, 'utf-8')) as TiledMapJson

function objectsOf(layerName: string): TiledSpaceObject[] {
  return mapJson.layers.find(layer => layer.name === layerName)?.objects ?? []
}

function toRects(objects: readonly TiledSpaceObject[]): CollisionRect[] {
  return objects.map(object => ({ x: object.x ?? 0, y: object.y ?? 0, width: object.width ?? 0, height: object.height ?? 0 }))
}

// Parsed once at process startup — the map doesn't change while the server is running.
export const privateZones: PrivateZone[] = resolvePrivateZones(objectsOf('spaces'))
export const gameTables = resolveGameTables(objectsOf('games'))

/**
 * The rectangles of the `collisions` layer, which block an avatar's feet (issue #254). Every
 * object counts, whatever its name; zero-area ones are harmless because `rectsOverlap` ignores them.
 */
export const colliders: CollisionRect[] = toRects(objectsOf('collisions'))

/** The rectangles of the `respawn` layer, where a person may start (issue #254). */
export const respawnAreas: RespawnRect[] = toRects(objectsOf('respawn'))

/** The map's size in pixels. */
export const mapSize = { width: mapJson.width * mapJson.tilewidth, height: mapJson.height * mapJson.tileheight }
