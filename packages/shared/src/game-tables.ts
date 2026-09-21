export interface GameTable {
  id: string
  gameType: 'pool'
  x: number
  y: number
  width: number
  height: number
}

interface TableObject {
  name?: string
  x?: number
  y?: number
  width?: number
  height?: number
  properties?: readonly { name: string, value: unknown }[]
}

export function resolveGameTables(objects: TableObject[]): GameTable[] {
  const ids = new Set<string>()
  return objects.flatMap((object) => {
    const { name: id, x, y, width, height } = object
    if (!id || ids.has(id) || ![x, y, width, height].every(value => typeof value === 'number' && Number.isFinite(value))
      || width! <= 0 || height! <= 0 || !object.properties?.some(p => p.name === 'gameType' && p.value === 'pool')) {
      return []
    }
    ids.add(id)
    return [{ id, gameType: 'pool' as const, x: x!, y: y!, width: width!, height: height! }]
  })
}

export const GAME_INTERACTION_DISTANCE = 48
/** Avatar coordinates are sprite centers; its foot anchor is 32 pixels below the center. */
export function distanceToTable(table: GameTable, avatarX: number, avatarY: number): number {
  const feetY = avatarY + 32
  return Math.hypot(Math.max(table.x - avatarX, 0, avatarX - table.x - table.width), Math.max(table.y - feetY, 0, feetY - table.y - table.height))
}

export function tableContains(table: GameTable, x: number, y: number): boolean {
  return x >= table.x && x <= table.x + table.width && y >= table.y && y <= table.y + table.height
}

export function selectGameTable(tables: GameTable[], x: number, y: number, hoveredId?: string): GameTable | undefined {
  return tables.filter(table => distanceToTable(table, x, y) <= GAME_INTERACTION_DISTANCE)
    .sort((a, b) => Number(b.id === hoveredId) - Number(a.id === hoveredId) || distanceToTable(a, x, y) - distanceToTable(b, x, y) || a.id.localeCompare(b.id))[0]
}
