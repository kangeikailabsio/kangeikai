import { DEVICE_CHOICE_STORAGE_KEY, DeviceChoiceStore } from '$lib/av/devices/device-choice-store'
import { afterEach, describe, expect, it, vi } from 'vitest'

function stubStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  const storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { data.set(key, value) }),
  }
  vi.stubGlobal('localStorage', storage)
  return { data, storage }
}

describe('deviceChoiceStore (issue #245)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts with no choice, which means "use the default device"', () => {
    stubStorage()

    expect(new DeviceChoiceStore().load()).toEqual({})
  })

  it('remembers a microphone and a camera independently', () => {
    const { data } = stubStorage()
    const store = new DeviceChoiceStore()

    store.choose('audioinput', 'mic-1')
    store.choose('videoinput', 'cam-9')

    expect(store.load()).toEqual({ audioinput: 'mic-1', videoinput: 'cam-9' })
    expect(JSON.parse(data.get(DEVICE_CHOICE_STORAGE_KEY)!)).toEqual({ audioinput: 'mic-1', videoinput: 'cam-9' })
  })

  it('replaces an earlier choice of the same kind and keeps the other kind', () => {
    stubStorage({ [DEVICE_CHOICE_STORAGE_KEY]: JSON.stringify({ audioinput: 'mic-1', videoinput: 'cam-9' }) })
    const store = new DeviceChoiceStore()

    store.choose('audioinput', 'mic-2')

    expect(store.load()).toEqual({ audioinput: 'mic-2', videoinput: 'cam-9' })
  })

  it('recovers each field on its own from corrupted data', () => {
    stubStorage({ [DEVICE_CHOICE_STORAGE_KEY]: JSON.stringify({ audioinput: 42, videoinput: 'cam-9' }) })

    expect(new DeviceChoiceStore().load()).toEqual({ videoinput: 'cam-9' })
  })

  it('treats unreadable or non-object data and empty ids as no choice', () => {
    stubStorage({ [DEVICE_CHOICE_STORAGE_KEY]: '{not json' })
    expect(new DeviceChoiceStore().load()).toEqual({})
    stubStorage({ [DEVICE_CHOICE_STORAGE_KEY]: '"a string"' })
    expect(new DeviceChoiceStore().load()).toEqual({})
    stubStorage({ [DEVICE_CHOICE_STORAGE_KEY]: JSON.stringify({ audioinput: '', videoinput: '' }) })
    expect(new DeviceChoiceStore().load()).toEqual({})
  })

  it('degrades to no choice and a silent no-op when storage throws (Safari private mode)', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    })
    const store = new DeviceChoiceStore()

    expect(store.load()).toEqual({})
    expect(() => store.choose('audioinput', 'mic-1')).not.toThrow()
  })
})
