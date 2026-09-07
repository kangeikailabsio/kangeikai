import type { UpdateStatePayload } from './room-connection'

/** Client→server position updates: on-change, capped ~20/sec (research.md). */
const SEND_INTERVAL_MS = 1000 / 20

function statesEqual(a: UpdateStatePayload, b: UpdateStatePayload | undefined): boolean {
  return b !== undefined && a.x === b.x && a.y === b.y && a.direction === b.direction && a.motionState === b.motionState
}

/**
 * Throttles `UpdateStatePayload` sends to `SEND_INTERVAL_MS`, deferring (rather than dropping) a
 * payload that arrives mid-window so the final state is never lost — extracted out of
 * `RoomConnection` (issue #134) so this deterministic timing logic can be unit-tested without a
 * real Colyseus connection, per AGENTS.md's "Vitest for pure/deterministic logic".
 */
export class PendingUpdateStateSender {
  private lastSentState: UpdateStatePayload | undefined
  private lastSentAt = 0
  private pendingPayload: UpdateStatePayload | undefined
  private pendingSend: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly send: (payload: UpdateStatePayload) => void) {}

  /** Sends `payload` now if the throttle window allows it, otherwise schedules a trailing send. */
  submit(payload: UpdateStatePayload): void {
    if (statesEqual(payload, this.lastSentState)) {
      return
    }

    const elapsed = Date.now() - this.lastSentAt
    if (elapsed >= SEND_INTERVAL_MS) {
      this.flush(payload)
      return
    }

    this.pendingPayload = payload
    if (this.pendingSend === undefined) {
      this.pendingSend = setTimeout(() => {
        this.pendingSend = undefined
        if (this.pendingPayload) {
          this.flush(this.pendingPayload)
        }
      }, SEND_INTERVAL_MS - elapsed)
    }
  }

  /**
   * Sends a still-pending (throttled) payload immediately instead of waiting for the trailing
   * timer — called right before a private-room LiveKit token request (issue #134) so the server
   * has already recorded the fresh, "inside the zone" position by the time it checks it, instead
   * of racing an HTTP request that has no throttle of its own against this one's.
   */
  flushPending(): void {
    if (this.pendingSend === undefined || this.pendingPayload === undefined) {
      return
    }
    clearTimeout(this.pendingSend)
    this.pendingSend = undefined
    this.flush(this.pendingPayload)
  }

  /** Clears throttle/pending state — call on disconnect. */
  reset(): void {
    if (this.pendingSend !== undefined) {
      clearTimeout(this.pendingSend)
      this.pendingSend = undefined
    }
    this.pendingPayload = undefined
    this.lastSentState = undefined
  }

  private flush(payload: UpdateStatePayload): void {
    this.send(payload)
    this.lastSentState = payload
    this.lastSentAt = Date.now()
    this.pendingPayload = undefined
  }
}
