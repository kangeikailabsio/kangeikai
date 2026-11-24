import { describe, expect, it } from 'vitest'
import { RateLimiter } from '../../src/http/rate-limiter'

describe('rateLimiter (issue #293)', () => {
  function limiter(limit = 3, windowMs = 60_000) {
    const clock = { now: 1_000_000 }
    return { clock, limiter: new RateLimiter(limit, windowMs, () => clock.now) }
  }

  it('allows calls up to the limit and refuses the next one', () => {
    const { limiter: l } = limiter()

    expect([l.check('a'), l.check('a'), l.check('a')].every(r => r.allowed)).toBe(true)
    expect(l.check('a')).toEqual({ allowed: false, retryAfterSeconds: 60 })
  })

  it('counts each key on its own', () => {
    const { limiter: l } = limiter(1)

    expect(l.check('a').allowed).toBe(true)
    expect(l.check('b').allowed).toBe(true)
    expect(l.check('a').allowed).toBe(false)
  })

  it('says how long is left of the window, rounded up and at least one second', () => {
    const { limiter: l, clock } = limiter(1)
    l.check('a')

    clock.now += 12_500
    expect(l.check('a')).toEqual({ allowed: false, retryAfterSeconds: 48 })
    clock.now += 47_000
    expect(l.check('a')).toEqual({ allowed: false, retryAfterSeconds: 1 })
  })

  it('does not move the window, or count, while refusing', () => {
    const { limiter: l, clock } = limiter(1)
    l.check('a')

    for (let i = 0; i < 5; i++) {
      clock.now += 10_000
      expect(l.check('a').allowed).toBe(false)
    }
    clock.now += 10_000

    expect(l.check('a').allowed).toBe(true)
  })

  it('starts a new window once the old one ends', () => {
    const { limiter: l, clock } = limiter(2)
    l.check('a')
    l.check('a')
    expect(l.check('a').allowed).toBe(false)

    clock.now += 60_000

    expect(l.check('a').allowed).toBe(true)
    expect(l.check('a').allowed).toBe(true)
    expect(l.check('a').allowed).toBe(false)
  })

  it('forgets the windows that ended, so the map does not grow forever', () => {
    const { limiter: l, clock } = limiter()
    for (let i = 0; i < 50; i++)
      l.check(`account-${i}`)
    expect(l.size).toBe(50)

    clock.now += 60_000
    l.check('someone-new')

    expect(l.size).toBe(1)
  })

  it('uses the real clock when none is given', () => {
    const real = new RateLimiter(1, 60_000)

    expect(real.check('a').allowed).toBe(true)
    expect(real.check('a').allowed).toBe(false)
  })
})
