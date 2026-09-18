import type { GameTable } from '@kangeikai/shared'
import { blocksOfficeInput } from '$lib/game/games/game-input'
import { distanceToTable, resolveGameTables, selectGameTable, tableContains } from '@kangeikai/shared'
import { describe, expect, it } from 'vitest'

const tables: GameTable[] = [
  { id: 'pool', gameType: 'pool', x: 256, y: 1504, width: 128, height: 96 },
  { id: 'pool-2', gameType: 'pool', x: 256, y: 1376, width: 128, height: 96 },
]

describe('game table interactions', () => {
  it('uses feet and rectangle edges with an inclusive 48-pixel range', () => {
    expect(distanceToTable(tables[0], 208, 1500)).toBe(48)
    expect(selectGameTable(tables, 208, 1500)?.id).toBe('pool')
    expect(selectGameTable(tables, 207.9, 1500)).toBeUndefined()
    expect(selectGameTable(tables, 320, 1320)?.id).toBe('pool-2')
  })
  it('prioritizes hover among nearby tables, otherwise uses distance then stable id', () => {
    expect(selectGameTable(tables, 320, 1456)?.id).toBe('pool')
    expect(selectGameTable(tables, 320, 1456, 'pool-2')?.id).toBe('pool-2')
    expect(selectGameTable(tables, 320, 1536, 'pool-2')?.id).toBe('pool')
  })
  it('requires both a table hit and proximity for a left-click interaction', () => {
    expect(tableContains(tables[0], 300, 1540)).toBe(true)
    expect(tableContains(tables[0], 500, 1540)).toBe(false)
    expect(selectGameTable([tables[0]], 1000, 1500)).toBeUndefined()
  })
  it('filters invalid map objects and duplicate table identifiers', () => {
    const valid = { name: 'pool', x: 1, y: 2, width: 128, height: 96, properties: [{ name: 'gameType', value: 'pool' }] }
    expect(resolveGameTables([valid, valid, { ...valid, name: 'bad', width: -1 }, { ...valid, name: 'unknown', properties: [] }])).toEqual([
      { id: 'pool', gameType: 'pool', x: 1, y: 2, width: 128, height: 96 },
    ])
  })
  it('blocks office controls for game, busy, screen share, or typing, and restores them when cleared', () => {
    const idle = { gameOpen: false, screenShareOpen: false, busy: false, typing: false }
    expect(blocksOfficeInput(idle)).toBe(false)
    for (const key of Object.keys(idle))
      expect(blocksOfficeInput({ ...idle, [key]: true })).toBe(true)
    expect(blocksOfficeInput(idle)).toBe(false)
  })
})
