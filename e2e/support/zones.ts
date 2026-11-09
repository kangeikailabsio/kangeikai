import { readFileSync } from 'node:fs'
import { resolvePrivateZones } from '@kangeikai/shared'

interface TiledLayer {
  name: string
  objects?: Parameters<typeof resolvePrivateZones>[0]
}

const MAP_PATH = new URL('../../packages/shared/assets/maps/welcome/map.tmj', import.meta.url)

/** The middle of a private zone of the shipped map, read from the map itself so a re-laid-out map does not break the tests. */
export function privateZoneCenter(name: string): { x: number, y: number } {
  const map = JSON.parse(readFileSync(MAP_PATH, 'utf8')) as { layers: TiledLayer[] }
  const zone = resolvePrivateZones(map.layers.find(layer => layer.name === 'spaces')?.objects ?? []).find(candidate => candidate.name === name)
  if (!zone)
    throw new Error(`The map has no private zone named "${name}"`)
  return { x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 }
}

/** A spot on the map outside every private zone (the spawn point). */
export const OUTSIDE_ZONES = { x: 150, y: 150 }
