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

  it('defaults to 1080p with audio off when nothing is stored', () => {
    expect(new ScreenShareQualityStore().load()).toEqual({ tier: '1080p', shareAudio: false })
  })

  it('round-trips a saved tier + shareAudio choice', () => {
    const store = new ScreenShareQualityStore()

    store.save({ tier: '2k', shareAudio: true })

    expect(store.load()).toEqual({ tier: '2k', shareAudio: true })
  })

  it('save() replaces any previously stored settings', () => {
    const store = new ScreenShareQualityStore()

    store.save({ tier: '720p', shareAudio: true })
    store.save({ tier: '2k', shareAudio: false })

    expect(store.load()).toEqual({ tier: '2k', shareAudio: false })
  })

  it('falls back to the default for a corrupted/removed-preset stored value', () => {
    localStorage.setItem(SCREEN_SHARE_QUALITY_STORAGE_KEY, JSON.stringify({ tier: '4k', shareAudio: true }))

    expect(new ScreenShareQualityStore().load()).toEqual({ tier: '1080p', shareAudio: false })
  })

  it('falls back to the default for the pre-#113 shape (a bare tier string)', () => {
    localStorage.setItem(SCREEN_SHARE_QUALITY_STORAGE_KEY, JSON.stringify('2k'))

    expect(new ScreenShareQualityStore().load()).toEqual({ tier: '1080p', shareAudio: false })
  })

  it('load() degrades to the default when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('storage disabled')
      },
    })

    expect(new ScreenShareQualityStore().load()).toEqual({ tier: '1080p', shareAudio: false })
  })

  it('save() silently does nothing when localStorage throws', () => {
    vi.stubGlobal('localStorage', {
      setItem: () => {
        throw new Error('storage disabled')
      },
    })

    expect(() => new ScreenShareQualityStore().save({ tier: '2k', shareAudio: true })).not.toThrow()
  })
})
