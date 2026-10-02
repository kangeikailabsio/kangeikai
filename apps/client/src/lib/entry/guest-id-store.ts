import { GUEST_ID_STORAGE_KEY } from './constants'

/**
 * Wraps `sessionStorage` for a per-tab guest identifier, sent to the server as part of the join
 * options (issue #178) so `OfficeRoom.onJoin` can recognize "this is the same guest re-joining"
 * and drop their previous, now-stale avatar instead of leaving a duplicate on the map.
 * `sessionStorage`, not `localStorage`, is deliberate: it survives a reload of the *same* tab
 * (so the dedup actually fires on the bug's main repro) but is never shared across separate
 * tabs of the same browser (so opening a second tab never kicks the first tab's avatar off the
 * map) — same per-tab reasoning as `BusyPresenceStore`.
 */
export class GuestIdStore {
  /** In-memory fallback so a thrown/disabled `sessionStorage` still returns a stable id for this tab's lifetime, even though it won't survive a reload. */
  private fallback: string | undefined

  /** Returns the existing id, or generates and persists a new one if none is stored yet. */
  get(): string {
    try {
      const existing = sessionStorage.getItem(GUEST_ID_STORAGE_KEY)
      if (existing) {
        return existing
      }

      const generated = crypto.randomUUID()
      sessionStorage.setItem(GUEST_ID_STORAGE_KEY, generated)
      return generated
    }
    catch {
      this.fallback ??= crypto.randomUUID()
      return this.fallback
    }
  }
}
