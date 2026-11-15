import { describe, expect, it } from 'vitest'
import { LastPositionStore } from '../../src/rooms/last-position-store'

describe('lastPositionStore (issue #259)', () => {
  it('remembers where an account was and nothing for one it has never seen', () => {
    const store = new LastPositionStore()

    store.remember('ana', { x: 10, y: 20 })

    expect(store.recall('ana')).toEqual({ x: 10, y: 20 })
    expect(store.recall('bruno')).toBeUndefined()
  })

  it('keeps only the latest position of an account', () => {
    const store = new LastPositionStore()
    store.remember('ana', { x: 10, y: 20 })

    store.remember('ana', { x: 30, y: 40 })

    expect(store.recall('ana')).toEqual({ x: 30, y: 40 })
  })

  it('hands out copies, so a caller cannot change what is remembered', () => {
    const store = new LastPositionStore()
    const point = { x: 1, y: 2 }
    store.remember('ana', point)
    point.x = 999
    store.recall('ana')!.y = 999

    expect(store.recall('ana')).toEqual({ x: 1, y: 2 })
  })

  it('forgets the account that left longest ago once it holds more than its limit', () => {
    const store = new LastPositionStore(2)
    store.remember('ana', { x: 1, y: 1 })
    store.remember('bruno', { x: 2, y: 2 })

    store.remember('carla', { x: 3, y: 3 })

    expect(store.recall('ana')).toBeUndefined()
    expect(store.recall('bruno')).toEqual({ x: 2, y: 2 })
    expect(store.recall('carla')).toEqual({ x: 3, y: 3 })
  })

  it('counts a returning account as recent, so it outlives one that left before it', () => {
    const store = new LastPositionStore(2)
    store.remember('ana', { x: 1, y: 1 })
    store.remember('bruno', { x: 2, y: 2 })
    store.remember('ana', { x: 5, y: 5 })

    store.remember('carla', { x: 3, y: 3 })

    expect(store.recall('bruno')).toBeUndefined()
    expect(store.recall('ana')).toEqual({ x: 5, y: 5 })
  })
})
