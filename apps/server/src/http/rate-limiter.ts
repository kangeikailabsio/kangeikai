export type RateLimitResult = { allowed: true } | { allowed: false, retryAfterSeconds: number }

interface Window {
  start: number
  count: number
}

/**
 * A fixed-window counter per key, kept in memory (issue #293). A restart resets it and several
 * server instances would each count on their own, like the rest of the process-local state. A
 * call over the limit does not count and does not move the window, so waiting out the window is
 * always enough.
 */
export class RateLimiter {
  private readonly windows = new Map<string, Window>()
  private lastSweep: number

  constructor(private readonly limit: number, private readonly windowMs: number, private readonly now: () => number = Date.now) {
    this.lastSweep = now()
  }

  /** Counts one call for `key` and says whether it is allowed. */
  check(key: string): RateLimitResult {
    const now = this.now()
    this.sweep(now)

    let window = this.windows.get(key)
    if (!window || now - window.start >= this.windowMs) {
      window = { start: now, count: 0 }
      this.windows.set(key, window)
    }
    if (window.count >= this.limit)
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((window.start + this.windowMs - now) / 1000)) }

    window.count++
    return { allowed: true }
  }

  /** How many keys are being tracked (for tests). */
  get size(): number {
    return this.windows.size
  }

  /** Drops the windows that have ended, at most once per window, so the map cannot grow forever. */
  private sweep(now: number): void {
    if (now - this.lastSweep < this.windowMs)
      return
    this.lastSweep = now
    for (const [key, window] of this.windows) {
      if (now - window.start >= this.windowMs)
        this.windows.delete(key)
    }
  }
}
