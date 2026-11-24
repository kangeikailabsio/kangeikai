import { fetchLiveKitToken } from '$lib/av/livekit-token-client'
import { afterEach, describe, expect, it, vi } from 'vitest'

const request = { identity: 'me', name: 'Me', proof: 'proof' }

/** A `fetch` that never answers on its own and rejects like the real one when its signal aborts. */
function hangingFetch() {
  return vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
  }))
}

describe('fetchLiveKitToken (issue #277)', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('returns the token the endpoint answers with', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ token: 't', url: 'wss://x' }))))

    await expect(fetchLiveKitToken('http://fake', request)).resolves.toEqual({ token: 't', url: 'wss://x' })
  })

  it('rejects with the status when the endpoint refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 403 })))

    await expect(fetchLiveKitToken('http://fake', request)).rejects.toThrow('(403)')
  })

  it('aborts the request after 10 s', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', hangingFetch())

    const assertion = expect(fetchLiveKitToken('http://fake', request)).rejects.toThrow('aborted')
    await vi.advanceTimersByTimeAsync(9_999)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)

    await assertion
  })

  it('clears the timer once the answer arrives', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ token: 't', url: 'u' }))))

    await fetchLiveKitToken('http://fake', request)

    expect(vi.getTimerCount()).toBe(0)
  })
})
