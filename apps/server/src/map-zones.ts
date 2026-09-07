import type { PrivateZone, TiledSpaceObject } from '@kangeikai/shared'
import { readFileSync } from 'node:fs'
import { resolvePrivateZones } from '@kangeikai/shared'

interface TiledLayer {
  name: string
  objects?: TiledSpaceObject[]
}

interface TiledMapJson {
  layers: TiledLayer[]
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

const SPACES_LAYER_NAME = 'spaces'

function loadPrivateZones(): PrivateZone[] {
  const mapJson = JSON.parse(readFileSync(MAP_PATH, 'utf-8')) as TiledMapJson
  const spacesLayer = mapJson.layers.find(layer => layer.name === SPACES_LAYER_NAME)
  return resolvePrivateZones(spacesLayer?.objects ?? [])
}

/** Parsed once at process startup — the map doesn't change while the server is running. */
export const privateZones: PrivateZone[] = loadPrivateZones()
