import type { AvatarPresence } from '@kangeikai/shared'
import * as v from 'valibot'
import { busyPresenceSchema } from './busy-presence-schema'
import { BUSY_PRESENCE_STORAGE_KEY } from './constants'

/**
 * Wraps `sessionStorage` for the per-tab `available` | `busy` picklist. Every read/write is
 * caught broadly — some browsers throw on storage access (notably Safari private browsing)
 * or it may be disabled by policy, and either case is treated as `'available'` / "save
 * silently did nothing" rather than surfacing an error. Never touches `localStorage`.
 */
export class BusyPresenceStore {
  /**
   * Returns `'available'` if nothing is stored, storage is unavailable, or the stored value
   * is invalid. Does not write back when the key is missing or the value is already valid.
   */
  load(): AvatarPresence {
    try {
      const raw = sessionStorage.getItem(BUSY_PRESENCE_STORAGE_KEY)
      if (raw === null) {
        return 'available'
      }

      const result = v.safeParse(busyPresenceSchema, JSON.parse(raw))
      return result.success ? result.output : 'available'
    }
    catch {
      return 'available'
    }
  }

  /** Best-effort — a thrown/disabled `sessionStorage` silently does nothing. */
  save(presence: AvatarPresence): void {
    try {
      sessionStorage.setItem(BUSY_PRESENCE_STORAGE_KEY, JSON.stringify(presence))
    }
    catch {
      // Storage unavailable — presence still applies for this visit, just won't survive F5.
    }
  }
}
