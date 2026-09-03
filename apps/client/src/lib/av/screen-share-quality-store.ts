import type { ScreenShareQualityTier } from './screen-share-quality'
import * as v from 'valibot'
import { DEFAULT_SCREEN_SHARE_QUALITY_TIER, SCREEN_SHARE_QUALITY_TIERS } from './screen-share-quality'

/** Single `localStorage` key the last-picked screen-share quality tier is stored under. */
export const SCREEN_SHARE_QUALITY_STORAGE_KEY = 'kangeikai:screen-share-quality'

/** Lenient schema for a stored tier — any missing/corrupted/removed-preset value recovers to the default. */
const storedTierSchema = v.fallback(v.picklist(SCREEN_SHARE_QUALITY_TIERS), DEFAULT_SCREEN_SHARE_QUALITY_TIER)

/**
 * Wraps `localStorage` for the screen-share quality tier picked in the popover (issue #111).
 * Same broad-catch pattern as `GuestProfileStore` (guest-profile-store.ts) — some browsers throw
 * on `localStorage` access (Safari private browsing) or it may be disabled by policy; either case
 * degrades to `DEFAULT_SCREEN_SHARE_QUALITY_TIER` on read and a silent no-op on write, rather
 * than surfacing an error.
 */
export class ScreenShareQualityStore {
  load(): ScreenShareQualityTier {
    try {
      const raw = localStorage.getItem(SCREEN_SHARE_QUALITY_STORAGE_KEY)
      if (raw === null) {
        return DEFAULT_SCREEN_SHARE_QUALITY_TIER
      }
      return v.parse(storedTierSchema, JSON.parse(raw))
    }
    catch {
      return DEFAULT_SCREEN_SHARE_QUALITY_TIER
    }
  }

  /** Best-effort — a thrown/disabled `localStorage` silently does nothing. */
  save(tier: ScreenShareQualityTier): void {
    try {
      localStorage.setItem(SCREEN_SHARE_QUALITY_STORAGE_KEY, JSON.stringify(tier))
    }
    catch {
      // Storage unavailable — the choice still applies for this share, it just won't stick.
    }
  }
}
