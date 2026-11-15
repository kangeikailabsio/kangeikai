import type { Point } from '../movement/movement-guard'

/** More accounts than this and the one that has been away longest is forgotten first. */
export const DEFAULT_MAX_REMEMBERED_ACCOUNTS = 10_000

/**
 * Where each account was the last time it left the office (issue #259), so that coming back (a
 * refresh, a closed tab, a dropped connection) puts the person there instead of at the spawn
 * point.
 *
 * It lives in this process's memory, outside any one room: the office room is disposed when its
 * last person leaves, and what is remembered must outlast that. Like the room state, it starts
 * empty when the server restarts and is never written to the database. Keyed by the account id the
 * ticket proved, so nobody can ask for another account's position. Bounded: past the limit the
 * least recently left account is dropped.
 */
export class LastPositionStore {
  private readonly positions = new Map<string, Point>()

  constructor(private readonly maxAccounts: number = DEFAULT_MAX_REMEMBERED_ACCOUNTS) {}

  remember(userId: string, point: Point): void {
    // Delete first so a returning account moves to the back of the Map's insertion order.
    this.positions.delete(userId)
    this.positions.set(userId, { x: point.x, y: point.y })
    if (this.positions.size > this.maxAccounts) {
      const oldest = this.positions.keys().next().value
      if (oldest !== undefined)
        this.positions.delete(oldest)
    }
  }

  recall(userId: string): Point | undefined {
    const point = this.positions.get(userId)
    return point && { x: point.x, y: point.y }
  }
}
