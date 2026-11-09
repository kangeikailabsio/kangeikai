import { registerE2eHook } from '$lib/game/e2e-hook'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('e2e hook (issue #227)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('exposes the hook on window and removes it again', () => {
    const fakeWindow: { __kangeikaiE2E?: unknown } = {}
    vi.stubGlobal('window', fakeWindow)
    const hook = { teleport: vi.fn(), position: vi.fn(() => ({ x: 1, y: 2 })) }

    const unregister = registerE2eHook(hook)
    expect(fakeWindow.__kangeikaiE2E).toBe(hook)

    unregister()
    expect(fakeWindow.__kangeikaiE2E).toBeUndefined()
  })

  it('does not remove a hook that a newer scene has registered since', () => {
    const fakeWindow: { __kangeikaiE2E?: unknown } = {}
    vi.stubGlobal('window', fakeWindow)
    const first = { teleport: vi.fn(), position: vi.fn() }
    const second = { teleport: vi.fn(), position: vi.fn() }

    const unregisterFirst = registerE2eHook(first)
    registerE2eHook(second)
    unregisterFirst()

    expect(fakeWindow.__kangeikaiE2E).toBe(second)
  })
})
