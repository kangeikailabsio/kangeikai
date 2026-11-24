import { sameEntries } from '$lib/av/same-entries'
import { describe, expect, it } from 'vitest'

describe('sameEntries (issue #292)', () => {
  const track = { id: 't' }

  it('is true for empty lists and for equal entries held in different objects', () => {
    expect(sameEntries([], [])).toBe(true)
    expect(sameEntries([{ a: 1, track }, { b: 'x' }], [{ a: 1, track }, { b: 'x' }])).toBe(true)
  })

  it('is false when the length, the order or a value differs', () => {
    expect(sameEntries([{ a: 1 }], [])).toBe(false)
    expect(sameEntries([{ a: 1 }, { a: 2 }], [{ a: 2 }, { a: 1 }])).toBe(false)
    expect(sameEntries([{ a: 1 }], [{ a: 2 }])).toBe(false)
  })

  it('compares objects by identity, not by content', () => {
    expect(sameEntries([{ track }], [{ track: { id: 't' } }])).toBe(false)
  })

  it('sees a key that exists on only one side, but not an undefined that is also missing', () => {
    expect(sameEntries<Record<string, unknown>>([{ a: 1 }], [{ a: 1, b: 2 }])).toBe(false)
    expect(sameEntries<Record<string, unknown>>([{ a: 1, b: undefined }], [{ a: 1 }])).toBe(true)
  })
})
