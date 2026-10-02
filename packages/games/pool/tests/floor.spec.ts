import { FLOOR_WOOD, MIN_SEAM_OFFSET, planks, seededRandom as seeded, shadeCss } from '@kangeikai/game-pool/floor'
import { describe, expect, it } from 'vitest'

const SIZE = { width: 900, height: 600 }

describe('plank layout', () => {
  it('keeps every board inside the floor bounds', () => {
    for (const plank of planks({ ...SIZE, random: seeded(1) })) {
      expect(plank.x).toBeGreaterThanOrEqual(0)
      expect(plank.y).toBeGreaterThanOrEqual(0)
      expect(plank.x + plank.width).toBeLessThanOrEqual(SIZE.width)
      expect(plank.y + plank.height).toBeLessThanOrEqual(SIZE.height)
      expect(plank.width).toBeGreaterThan(0)
      expect(plank.height).toBeGreaterThan(0)
    }
  })

  it('covers the full width of every row and the full height', () => {
    const plankHeight = 34
    const laid = planks({ ...SIZE, plankHeight, random: seeded(2) })
    const rows = new Map<number, number>()
    for (const plank of laid)
      rows.set(plank.y, (rows.get(plank.y) ?? 0) + plank.width)
    expect(rows.size).toBe(Math.ceil(SIZE.height / plankHeight))
    for (const covered of rows.values())
      expect(covered).toBeCloseTo(SIZE.width, 6)
    expect(Math.max(...rows.keys()) + plankHeight).toBeGreaterThanOrEqual(SIZE.height)
  })

  it('never lines a seam up with the row above it', () => {
    const plankHeight = 34
    const laid = planks({ ...SIZE, plankHeight, random: seeded(3) })
    const seamsByRow = new Map<number, number[]>()
    for (const plank of laid) {
      const seams = seamsByRow.get(plank.y) ?? []
      seams.push(plank.x + plank.width)
      seamsByRow.set(plank.y, seams)
    }
    const rows = [...seamsByRow.keys()].sort((a, b) => a - b)
    for (let i = 1; i < rows.length; i++) {
      const above = seamsByRow.get(rows[i - 1])!
      for (const seam of seamsByRow.get(rows[i])!) {
        if (seam >= SIZE.width)
          continue
        for (const other of above) {
          if (other < SIZE.width)
            expect(Math.abs(seam - other)).toBeGreaterThan(MIN_SEAM_OFFSET - 1e-9)
        }
      }
    }
  })

  it('is deterministic for a given random source', () => {
    expect(planks({ ...SIZE, random: seeded(7) })).toEqual(planks({ ...SIZE, random: seeded(7) }))
  })

  it('varies the shade within a sane range', () => {
    const shades = planks({ ...SIZE, random: seeded(4) }).map(plank => plank.shade)
    expect(Math.min(...shades)).toBeGreaterThanOrEqual(0.82)
    expect(Math.max(...shades)).toBeLessThanOrEqual(1.18)
    expect(new Set(shades).size).toBeGreaterThan(10)
  })
})

describe('shadeCss', () => {
  it('scales channels and zero-pads', () => {
    expect(shadeCss(0x102030, 1)).toBe('#102030')
    expect(shadeCss(0x000000, 2)).toBe('#000000')
  })

  it('clamps at both ends instead of wrapping', () => {
    expect(shadeCss(FLOOR_WOOD, 0)).toBe('#000000')
    expect(shadeCss(FLOOR_WOOD, 100)).toBe('#ffffff')
  })
})
