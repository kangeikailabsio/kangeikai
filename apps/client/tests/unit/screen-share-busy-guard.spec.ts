import { isBusyBlockedByScreenShare } from '$lib/av/screen-share-busy-guard'
import { describe, expect, it } from 'vitest'

describe('isBusyBlockedByScreenShare', () => {
  it('blocks entering busy while sharing the screen', () => {
    expect(isBusyBlockedByScreenShare(true, 'busy')).toBe(true)
  })

  it('allows entering busy when not sharing', () => {
    expect(isBusyBlockedByScreenShare(false, 'busy')).toBe(false)
  })

  it('never blocks leaving busy (going available), even while sharing', () => {
    expect(isBusyBlockedByScreenShare(true, 'available')).toBe(false)
  })

  it('allows staying available when not sharing', () => {
    expect(isBusyBlockedByScreenShare(false, 'available')).toBe(false)
  })
})
