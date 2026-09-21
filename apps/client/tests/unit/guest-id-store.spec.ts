import { GUEST_ID_STORAGE_KEY, GUEST_PROFILE_STORAGE_KEY } from '$lib/entry/constants'
import { GuestIdStore } from '$lib/entry/guest-id-store'
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

describe('guestIdStore', () => {
  beforeEach(() => {
    const sessionStorageMock = createMockStorage()
    const localStorageMock = createMockStorage()
    vi.spyOn(localStorageMock, 'getItem')
    vi.spyOn(localStorageMock, 'setItem')
    vi.stubGlobal('sessionStorage', sessionStorageMock)
    vi.stubGlobal('localStorage', localStorageMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('generates and persists an id when nothing is stored', () => {
    const id = new GuestIdStore().get()

    expect(id).toEqual(expect.any(String))
    expect(id.length).toBeGreaterThan(0)
    expect(sessionStorage.getItem(GUEST_ID_STORAGE_KEY)).toBe(id)
  })

  it('returns the same id on every call from the same instance', () => {
    const store = new GuestIdStore()

    expect(store.get()).toBe(store.get())
  })

  it('returns the same id across separate instances reading the same sessionStorage (same-tab reload)', () => {
    const first = new GuestIdStore().get()
    const second = new GuestIdStore().get()

    expect(second).toBe(first)
  })

  it('never reads or writes localStorage', () => {
    new GuestIdStore().get()

    expect(localStorage.getItem).not.toHaveBeenCalled()
    expect(localStorage.setItem).not.toHaveBeenCalled()
  })

  it('does not touch the guest-profile key', () => {
    new GuestIdStore().get()

    expect(sessionStorage.getItem(GUEST_PROFILE_STORAGE_KEY)).toBeNull()
  })

  it('falls back to a stable in-memory id when sessionStorage throws', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('storage disabled')
      },
      setItem: () => {
        throw new Error('storage disabled')
      },
    })

    const store = new GuestIdStore()
    const first = store.get()
    const second = store.get()

    expect(first).toEqual(expect.any(String))
    expect(second).toBe(first)
  })

  it('does not throw when sessionStorage.setItem throws after a successful getItem', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage disabled')
      },
    })

    expect(() => new GuestIdStore().get()).not.toThrow()
  })
})
