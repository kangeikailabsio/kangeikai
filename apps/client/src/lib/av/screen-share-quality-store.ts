import type { ScreenShareQualityTier } from './screen-share-quality'
import * as v from 'valibot'
import { DEFAULT_SCREEN_SHARE_QUALITY_TIER, SCREEN_SHARE_QUALITY_TIERS } from './screen-share-quality'

/** Single `localStorage` key the last-picked screen-share settings are stored under. */
export const SCREEN_SHARE_QUALITY_STORAGE_KEY = 'kangeikai:screen-share-quality'

export interface ScreenShareSettings {
  tier: ScreenShareQualityTier
  /** Whether the "Share audio too" checkbox was ticked (issue #113). */
  shareAudio: boolean
}

export const DEFAULT_SCREEN_SHARE_SETTINGS: ScreenShareSettings = {
  tier: DEFAULT_SCREEN_SHARE_QUALITY_TIER,
  shareAudio: false,
}

/**
 * Lenient schema for stored settings — any missing/corrupted value, or the pre-#113 shape
 * (a bare tier string, e.g. `"1080p"`), recovers to the default rather than throwing.
 */
const storedSettingsSchema = v.fallback(
  v.object({
    tier: v.picklist(SCREEN_SHARE_QUALITY_TIERS),
    shareAudio: v.boolean(),
  }),
  DEFAULT_SCREEN_SHARE_SETTINGS,
)

/**
 * Wraps `localStorage` for the screen-share quality tier + "share audio too" choice picked in
 * the popover (issue #111, extended by #113). Same broad-catch pattern as `GuestProfileStore`
 * (guest-profile-store.ts) — some browsers throw on `localStorage` access (Safari private
 * browsing) or it may be disabled by policy; either case degrades to
 * `DEFAULT_SCREEN_SHARE_SETTINGS` on read and a silent no-op on write, rather than surfacing an
 * error.
 */
export class ScreenShareQualityStore {
  load(): ScreenShareSettings {
    try {
      const raw = localStorage.getItem(SCREEN_SHARE_QUALITY_STORAGE_KEY)
      if (raw === null) {
        return DEFAULT_SCREEN_SHARE_SETTINGS
      }
      return v.parse(storedSettingsSchema, JSON.parse(raw))
    }
    catch {
      return DEFAULT_SCREEN_SHARE_SETTINGS
    }
  }

  /** Best-effort — a thrown/disabled `localStorage` silently does nothing. */
  save(settings: ScreenShareSettings): void {
    try {
      localStorage.setItem(SCREEN_SHARE_QUALITY_STORAGE_KEY, JSON.stringify(settings))
    }
    catch {
      // Storage unavailable — the choice still applies for this share, it just won't stick.
    }
  }
}
