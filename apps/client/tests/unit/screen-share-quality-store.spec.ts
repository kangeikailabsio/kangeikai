import { SCREEN_SHARE_QUALITY_STORAGE_KEY, ScreenShareQualityStore } from '$lib/av/screen-share-quality-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function createMockStorage(): Storage {
  const data = new Map<string, string>()
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value) },
    removeItem: (key) => { data.delete(key) },
    clear: () => data.clear(),
    key: index => [...data.keys()][index] ?? null,
    get length() { return data.size },
  }
}

describe('screenShareQualityStore', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMockStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to 1080p when nothing is stored', () => {
    expect(new ScreenShareQualityStore().load()).toBe('1080p')
  })

  it('round-trips a saved tier', () => {
    const store = new ScreenShareQualityStore()

    store.save('2k')

    expect(store.load()).toBe('2k')
  })

  it('save() replaces any previously stored tier', () => {
    const store = new ScreenShareQualityStore()

    store.save('720p')
    store.save('2k')

    expect(store.load()).toBe('2k')
  })

  it('falls back to 1080p for a corrupted/removed-preset stored value', () => {
    localStorage.setItem(SCREEN_SHARE_QUALITY_STORAGE_KEY, JSON.stringify('4k'))

    expect(new ScreenShareQualityStore().load()).toBe('1080p')
  })

  it('load() degrades to 1080p when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage disabled')
      },
    })

    expect(new ScreenShareQualityStore().load()).toBe('1080p')
  })

  it('save() silently does nothing when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('storage disabled')
      },
    })

    expect(() => new ScreenShareQualityStore().save('2k')).not.toThrow()
  })
})
