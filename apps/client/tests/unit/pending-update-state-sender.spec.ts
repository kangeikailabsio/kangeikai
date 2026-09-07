import type { UpdateStatePayload } from '$lib/network/room-connection'
import { PendingUpdateStateSender } from '$lib/network/pending-update-state-sender'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

function payload(x: number, y = 0): UpdateStatePayload {
  return { x, y, direction: 'down', motionState: 'idle' }
}

describe('pendingUpdateStateSender', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('sends immediately when the throttle window has already elapsed', () => {
    const send = vi.fn()
    const sender = new PendingUpdateStateSender(send)

    sender.submit(payload(1))

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(payload(1))
  })

  it('does not resend an unchanged payload', () => {
    const send = vi.fn()
    const sender = new PendingUpdateStateSender(send)

    sender.submit(payload(1))
    sender.submit(payload(1))

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('defers a payload that arrives within the throttle window and sends it later', () => {
    const send = vi.fn()
    const sender = new PendingUpdateStateSender(send)

    sender.submit(payload(1))
    sender.submit(payload(2))
    expect(send).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(50)

    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith(payload(2))
  })

  it('flushPending sends a throttled payload immediately instead of waiting for the timer', () => {
    const send = vi.fn()
    const sender = new PendingUpdateStateSender(send)

    sender.submit(payload(1))
    sender.submit(payload(2))
    expect(send).toHaveBeenCalledTimes(1)

    sender.flushPending()

    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenLastCalledWith(payload(2))

    // The trailing timer must not fire a second time after being flushed early.
    vi.advanceTimersByTime(50)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('flushPending is a no-op when nothing is pending', () => {
    const send = vi.fn()
    const sender = new PendingUpdateStateSender(send)

    sender.submit(payload(1))
    expect(send).toHaveBeenCalledTimes(1)

    sender.flushPending()

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('reset clears a pending send so it never fires', () => {
    const send = vi.fn()
    const sender = new PendingUpdateStateSender(send)

    sender.submit(payload(1))
    sender.submit(payload(2))
    expect(send).toHaveBeenCalledTimes(1)

    sender.reset()
    vi.advanceTimersByTime(50)

    expect(send).toHaveBeenCalledTimes(1)
  })

  it('resubmitting the same payload after a reset sends it again once the throttle window allows', () => {
    const send = vi.fn()
    const sender = new PendingUpdateStateSender(send)

    sender.submit(payload(1))
    sender.reset()
    // reset() clears the "last sent" payload so the (now unequal-to-nothing) resubmission isn't
    // suppressed as a no-op, but it doesn't reset the throttle clock — matching the original
    // RoomConnection.disconnect()'s behavior this was extracted from.
    sender.submit(payload(1))
    expect(send).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(50)

    expect(send).toHaveBeenCalledTimes(2)
  })
})
