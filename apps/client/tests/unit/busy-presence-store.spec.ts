import { BusyPresenceStore } from '$lib/entry/busy-presence-store'
import { BUSY_PRESENCE_STORAGE_KEY, GUEST_PROFILE_STORAGE_KEY } from '$lib/entry/constants'
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

describe('busyPresenceStore', () => {
  beforeEach(() => {
    const sessionStorageMock = createMockStorage()
    const localStorageMock = createMockStorage()
    vi.spyOn(sessionStorageMock, 'getItem')
    vi.spyOn(sessionStorageMock, 'setItem')
    vi.spyOn(localStorageMock, 'getItem')
    vi.spyOn(localStorageMock, 'setItem')
    vi.stubGlobal('sessionStorage', sessionStorageMock)
    vi.stubGlobal('localStorage', localStorageMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns available when nothing is stored', () => {
    expect(new BusyPresenceStore().load()).toBe('available')
  })

  it('round-trips available', () => {
    const store = new BusyPresenceStore()

    store.save('available')

    expect(store.load()).toBe('available')
    expect(sessionStorage.getItem(BUSY_PRESENCE_STORAGE_KEY)).toBe(JSON.stringify('available'))
  })

  it('round-trips busy', () => {
    const store = new BusyPresenceStore()

    store.save('busy')

    expect(store.load()).toBe('busy')
    expect(sessionStorage.getItem(BUSY_PRESENCE_STORAGE_KEY)).toBe(JSON.stringify('busy'))
  })

  it('degrades to available when the stored blob is not valid JSON', () => {
    sessionStorage.setItem(BUSY_PRESENCE_STORAGE_KEY, 'not-json')

    expect(new BusyPresenceStore().load()).toBe('available')
  })

  it('degrades to available when the stored value is outside the picklist', () => {
    sessionStorage.setItem(BUSY_PRESENCE_STORAGE_KEY, JSON.stringify('away'))

    expect(new BusyPresenceStore().load()).toBe('available')
  })

  it('degrades to available when the stored value is an object', () => {
    sessionStorage.setItem(BUSY_PRESENCE_STORAGE_KEY, JSON.stringify({ presence: 'busy' }))

    expect(new BusyPresenceStore().load()).toBe('available')
  })

  it('load() degrades to available when sessionStorage throws', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('storage disabled')
      },
    })

    expect(new BusyPresenceStore().load()).toBe('available')
  })

  it('save() silently does nothing when sessionStorage throws', () => {
    vi.stubGlobal('sessionStorage', {
      setItem: () => {
        throw new Error('storage disabled')
      },
    })

    expect(() => new BusyPresenceStore().save('busy')).not.toThrow()
  })

  it('does not read or write localStorage or the guest-profile key', () => {
    const store = new BusyPresenceStore()
    store.save('busy')
    expect(store.load()).toBe('busy')

    expect(localStorage.getItem).not.toHaveBeenCalled()
    expect(localStorage.setItem).not.toHaveBeenCalled()

    for (const [key] of vi.mocked(sessionStorage.getItem).mock.calls) {
      expect(key).toBe(BUSY_PRESENCE_STORAGE_KEY)
      expect(key).not.toBe(GUEST_PROFILE_STORAGE_KEY)
    }
    for (const [key] of vi.mocked(sessionStorage.setItem).mock.calls) {
      expect(key).toBe(BUSY_PRESENCE_STORAGE_KEY)
      expect(key).not.toBe(GUEST_PROFILE_STORAGE_KEY)
    }
  })
})
