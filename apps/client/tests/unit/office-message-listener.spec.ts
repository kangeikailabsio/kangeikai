import type { MessageSource } from '$lib/network/office-message-listener'
import { listenToOfficeMessage } from '$lib/network/office-message-listener'
import { describe, expect, it, vi } from 'vitest'

/** A room that lets the test play the server: `deliver` is what arrives for a message name. */
function fakeRoom() {
  const callbacks = new Map<string, (payload: unknown) => void>()
  const room: MessageSource = { onMessage: (type, callback) => void callbacks.set(type, callback) }
  return { room, deliver: (type: string, payload: unknown) => callbacks.get(type)?.(payload) }
}

const validPayloads = {
  interactionReceived: { kind: 'hello', fromSessionId: 'abc', fromDisplayName: 'Ana' },
  spawn: { x: 300, y: 2300 },
  correctPosition: { x: 10, y: 20 },
  sessionProof: { proof: 'signature' },
} as const

const invalidPayloads: Record<keyof typeof validPayloads, unknown[]> = {
  interactionReceived: [undefined, { kind: 'wave', fromSessionId: 'abc', fromDisplayName: 'Ana' }, { kind: 'hello' }],
  spawn: [undefined, { x: 1 }, { x: '1', y: 2 }, { x: Number.NaN, y: 2 }],
  correctPosition: [null, { x: 1, y: Number.POSITIVE_INFINITY }, 'x'],
  sessionProof: [undefined, {}, { proof: '' }, { proof: 42 }],
}

describe('listenToOfficeMessage (issue #260)', () => {
  for (const name of Object.keys(validPayloads) as (keyof typeof validPayloads)[]) {
    it(`hands the handler a valid "${name}" payload`, () => {
      const { room, deliver } = fakeRoom()
      const handler = vi.fn()
      listenToOfficeMessage(room, name, handler, vi.fn())

      deliver(name, validPayloads[name])

      expect(handler).toHaveBeenCalledExactlyOnceWith(validPayloads[name])
    })

    it(`drops an invalid "${name}" payload and warns, without reaching the handler`, () => {
      const { room, deliver } = fakeRoom()
      const handler = vi.fn()
      const warn = vi.fn()
      listenToOfficeMessage(room, name, handler, warn)

      for (const bad of invalidPayloads[name])
        deliver(name, bad)

      expect(handler).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledTimes(invalidPayloads[name].length)
      expect(warn.mock.calls[0][0]).toContain(name)
    })
  }

  it('keeps listening after an invalid payload', () => {
    const { room, deliver } = fakeRoom()
    const handler = vi.fn()
    listenToOfficeMessage(room, 'spawn', handler, vi.fn())

    deliver('spawn', { x: 'bad' })
    deliver('spawn', validPayloads.spawn)

    expect(handler).toHaveBeenCalledExactlyOnceWith(validPayloads.spawn)
  })

  it('registers under the protocol name', () => {
    const onMessage = vi.fn()
    listenToOfficeMessage({ onMessage }, 'correctPosition', vi.fn())

    expect(onMessage).toHaveBeenCalledWith('correctPosition', expect.any(Function))
  })
})
