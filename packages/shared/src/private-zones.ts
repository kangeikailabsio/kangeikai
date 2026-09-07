export interface TiledObjectProperty {
  name: string
  value: unknown
}

/** Just the fields `resolvePrivateZones` reads off a Tiled object-layer object. */
export interface TiledSpaceObject {
  id: number
  name: string
  x?: number
  y?: number
  width?: number
  height?: number
  properties?: readonly TiledObjectProperty[]
}

export interface PrivateZone {
  /** The Tiled object's own `id` — unique and stable, unlike `name` (author-typed, may repeat or be blank). Used as the zone's LiveKit room identity. */
  id: number
  name: string
  x: number
  y: number
  width: number
  height: number
}

function isPrivate(object: TiledSpaceObject): boolean {
  return object.properties?.some(property => property.name === 'private' && property.value === true) ?? false
}

/**
 * Every object in the `spaces` layer flagged `private: true` in Tiled, as a rectangle zone.
 * Objects without the flag are ignored — there's no other kind of zone any more.
 */
export function resolvePrivateZones(objects: readonly TiledSpaceObject[]): PrivateZone[] {
  return objects.filter(isPrivate).map(object => ({
    id: object.id,
    name: object.name,
    x: object.x ?? 0,
    y: object.y ?? 0,
    width: object.width ?? 0,
    height: object.height ?? 0,
  }))
}

/**
 * The private zone containing (x, y), or `null` if outside every zone (zones are assumed
 * non-overlapping per map authoring — same assumption the old zone lookup made).
 */
export function privateZoneAt(zones: readonly PrivateZone[], x: number, y: number): PrivateZone | null {
  const zone = zones.find(z => x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height)
  return zone ?? null
}
