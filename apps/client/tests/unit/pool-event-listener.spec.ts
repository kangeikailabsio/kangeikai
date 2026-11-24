import type { MessageSource } from '$lib/network/office-message-listener'
import { listenToPoolEvents } from '$lib/network/pool-event-listener'
import { POOL_EVENT } from '@kangeikai/game-pool/protocol'
import { describe, expect, it, vi } from 'vitest'

function fakeRoom() {
  const callbacks = new Map<string, (payload: unknown) => void>()
  const room: MessageSource = { onMessage: (type, callback) => void callbacks.set(type, callback) }
  return { room, deliver: (payload: unknown) => callbacks.get(POOL_EVENT)?.(payload) }
}

describe('listenToPoolEvents (issue #278)', () => {
  it('hands the handler a valid event', () => {
    const { room, deliver } = fakeRoom()
    const handler = vi.fn()
    listenToPoolEvents(room, handler, vi.fn())

    deliver({ kind: 'closed', tableId: 'one' })

    expect(handler).toHaveBeenCalledExactlyOnceWith({ kind: 'closed', tableId: 'one' })
  })

  it('drops an invalid event and warns, without reaching the handler', () => {
    const { room, deliver } = fakeRoom()
    const handler = vi.fn()
    const warn = vi.fn()
    listenToPoolEvents(room, handler, warn)

    for (const bad of [undefined, { kind: 'closed' }, { kind: 'snapshot', state: {} }, 'boom'])
      deliver(bad)

    expect(handler).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(4)
    expect(warn.mock.calls[0][0]).toContain('pool event')
  })

  it('keeps listening after an invalid event', () => {
    const { room, deliver } = fakeRoom()
    const handler = vi.fn()
    listenToPoolEvents(room, handler, vi.fn())

    deliver({ nope: true })
    deliver({ kind: 'error', message: 'x' })

    expect(handler).toHaveBeenCalledTimes(1)
  })
})
