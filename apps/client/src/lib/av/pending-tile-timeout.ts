const DEFAULT_TIMEOUT_MS = 15_000

/**
 * Hides a remote person's "still connecting" tile (issue #141) once they have been pending for
 * too long (issue #225). The server can't tell us whether they are slow or failed — a remote
 * failure has no propagation mechanism — so past the timeout we stop showing a spinner that may
 * never resolve. The tile comes back on its own as a real one if they connect later, because
 * "pending" is derived every frame from who is in the zone but not yet in the LiveKit room.
 *
 * Pure and clock-agnostic: callers pass `now`, so it is testable without timers.
 */
export class PendingTileTimeout {
  private readonly firstPendingAt = new Map<string, number>()

  constructor(private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS) {}

  /**
   * Call once per refresh with everyone currently pending. Returns the ones still worth showing.
   * Anyone missing from `pendingIds` (connected, left the zone, went busy) is forgotten, so
   * their next pending spell is timed from scratch.
   */
  visible(pendingIds: Iterable<string>, now: number): Set<string> {
    const pending = new Set(pendingIds)
    for (const id of this.firstPendingAt.keys()) {
      if (!pending.has(id))
        this.firstPendingAt.delete(id)
    }

    const visible = new Set<string>()
    for (const id of pending) {
      const since = this.firstPendingAt.get(id) ?? now
      this.firstPendingAt.set(id, since)
      if (now - since < this.timeoutMs)
        visible.add(id)
    }
    return visible
  }
}
