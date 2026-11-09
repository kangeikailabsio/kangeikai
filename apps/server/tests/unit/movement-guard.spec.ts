import type { MovementRules } from '../../src/movement/movement-guard'
import { describe, expect, it } from 'vitest'
import { acceptMove, ALLOWANCE_SECONDS, isWalkable, MAX_SPEED_PX_PER_SECOND, newBudget, routeIsClear, STEP_MARGIN_PX } from '../../src/movement/movement-guard'

// A 400x400 map with a 10 px thick wall across x = 200, from y = 0 to 300 (an opening below it).
const rules: MovementRules = {
  colliders: [{ x: 195, y: 0, width: 10, height: 300 }, { x: 50, y: 50, width: 0, height: 0 }],
  mapWidth: 400,
  mapHeight: 400,
}

describe('isWalkable (issue #255)', () => {
  it('accepts open ground and the map edges', () => {
    expect(isWalkable({ x: 100, y: 100 }, rules)).toBe(true)
    expect(isWalkable({ x: 0, y: 0 }, rules)).toBe(true)
    expect(isWalkable({ x: 400, y: 400 }, rules)).toBe(true)
  })

  it('refuses numbers that are not positions', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])
      expect(isWalkable({ x: bad, y: 10 }, rules)).toBe(false)
  })

  it('refuses outside the map', () => {
    expect(isWalkable({ x: -1, y: 10 }, rules)).toBe(false)
    expect(isWalkable({ x: 10, y: 401 }, rules)).toBe(false)
  })

  it('refuses standing in a wall, by the feet and not by the head', () => {
    expect(isWalkable({ x: 200, y: 100 }, rules)).toBe(false)
    // The wall ends at y = 300; the feet box is 12 px tall at y + 20..32, so the head can poke into it.
    expect(isWalkable({ x: 200, y: 280 }, rules)).toBe(true)
  })

  it('ignores a zero-area collider like the client does', () => {
    expect(isWalkable({ x: 50, y: 50 }, rules)).toBe(true)
  })
})

describe('routeIsClear', () => {
  it('is clear in the open and blocked across a wall, even when both ends are free', () => {
    expect(routeIsClear({ x: 100, y: 100 }, { x: 150, y: 100 }, rules)).toBe(true)
    expect(routeIsClear({ x: 150, y: 100 }, { x: 250, y: 100 }, rules)).toBe(false)
  })

  it('goes around the wall through the opening only by walking there', () => {
    expect(routeIsClear({ x: 150, y: 340 }, { x: 250, y: 340 }, rules)).toBe(true)
  })

  it('accepts a corner taken as an L even when the straight line clips the obstacle', () => {
    const cornerRules: MovementRules = { colliders: [{ x: 100, y: 100, width: 40, height: 40 }], mapWidth: 400, mapHeight: 400 }
    // The straight line from the feet at (90, 80) to (150, 160) crosses the block; the L along the left and bottom does not.
    const from = { x: 80, y: 60 }
    const to = { x: 80, y: 140 }
    expect(routeIsClear(from, to, cornerRules)).toBe(true)
  })
})

describe('acceptMove', () => {
  const at = (ms: number) => ms

  it('accepts a walk at normal speed, step after step', () => {
    const budget = newBudget(at(0))
    let from = { x: 100, y: 100 }
    for (let i = 1; i <= 100; i++) {
      const to = { x: 100 + i * 10, y: 100 }
      if (to.x > 170)
        break
      expect(acceptMove(budget, from, to, rules, at(i * 50))).toBe(true)
      from = to
    }
  })

  it('accepts messages that arrive late and all at once', () => {
    const budget = newBudget(at(0))
    expect(acceptMove(budget, { x: 100, y: 100 }, { x: 115, y: 100 }, rules, at(1000))).toBe(true)
    expect(acceptMove(budget, { x: 115, y: 100 }, { x: 130, y: 100 }, rules, at(1001))).toBe(true)
    expect(acceptMove(budget, { x: 130, y: 100 }, { x: 145, y: 100 }, rules, at(1002))).toBe(true)
  })

  it('refuses a jump far beyond what the speed allows', () => {
    const budget = newBudget(at(0))
    const reach = MAX_SPEED_PX_PER_SECOND * ALLOWANCE_SECONDS + STEP_MARGIN_PX
    expect(acceptMove(budget, { x: 10, y: 350 }, { x: 10 + reach + 1, y: 350 }, { ...rules, mapWidth: 5000 }, at(0))).toBe(false)
  })

  it('does not let a long silence turn into a long jump', () => {
    const budget = newBudget(at(0))
    expect(acceptMove(budget, { x: 10, y: 350 }, { x: 10 + 1000, y: 350 }, { ...rules, mapWidth: 5000 }, at(60_000))).toBe(false)
  })

  it('refuses a sustained speed above the limit', () => {
    const budget = newBudget(at(0))
    const fast = (MAX_SPEED_PX_PER_SECOND * 2) / 20
    let from = { x: 10, y: 350 }
    let refused = false
    for (let i = 1; i <= 40; i++) {
      const to = { x: from.x + fast, y: 350 }
      if (!acceptMove(budget, from, to, { ...rules, mapWidth: 5000 }, at(i * 50))) {
        refused = true
        break
      }
      from = to
    }
    expect(refused).toBe(true)
  })

  it('refuses crossing the wall, and a refused move spends nothing', () => {
    const budget = newBudget(at(0))
    expect(acceptMove(budget, { x: 150, y: 100 }, { x: 250, y: 100 }, rules, at(0))).toBe(false)
    expect(acceptMove(budget, { x: 150, y: 100 }, { x: 165, y: 100 }, rules, at(0))).toBe(true)
  })

  it('refuses NaN', () => {
    expect(acceptMove(newBudget(0), { x: 100, y: 100 }, { x: Number.NaN, y: 100 }, rules, 0)).toBe(false)
  })
})
