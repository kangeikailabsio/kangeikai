import type { ScreenShareCaptureOptions, TrackPublishOptions } from 'livekit-client'
import { ScreenSharePresets, VideoPreset } from 'livekit-client'

/** Issue #111 — quality tiers offered by the screen-share popover, from lightest to heaviest. */
export const SCREEN_SHARE_QUALITY_TIERS = ['720p', '1080p', '2k'] as const
export type ScreenShareQualityTier = (typeof SCREEN_SHARE_QUALITY_TIERS)[number]

export const DEFAULT_SCREEN_SHARE_QUALITY_TIER: ScreenShareQualityTier = '1080p'

export const SCREEN_SHARE_QUALITY_LABELS: Record<ScreenShareQualityTier, string> = {
  '720p': '720p (light)',
  '1080p': '1080p (recommended)',
  '2k': '2K',
}

/**
 * `ScreenSharePresets` (livekit-client) tops out at `h1080fps30` — there is no preset above
 * 1080p, so 2K is a hand-built `VideoPreset` (issue #111's grill: no market alternative needed,
 * the SDK's capture/publish options already accept arbitrary resolutions/bitrates). 8 Mbps is a
 * proportional scale-up of `h1080fps30`'s 5 Mbps: 2560x1440 has ~1.8x 1080p's pixel count.
 */
const TWO_K_SCREEN_SHARE_PRESET = new VideoPreset(2560, 1440, 8_000_000, 30, 'medium')

const PRESET_BY_TIER: Record<ScreenShareQualityTier, VideoPreset> = {
  // 1280x720 @ 15fps, 1.5 Mbps — the SDK's own "light" preset (fps matters more than resolution
  // for screen-share bitrate savings on a weak connection, per issue #111's grill).
  '720p': ScreenSharePresets.h720fps15,
  '1080p': ScreenSharePresets.h1080fps30,
  '2k': TWO_K_SCREEN_SHARE_PRESET,
}

/** Pure mapping from a chosen tier to the LiveKit options `MediaControls` passes through. */
export function resolveScreenShareQuality(tier: ScreenShareQualityTier): {
  captureOptions: ScreenShareCaptureOptions
  publishOptions: Pick<TrackPublishOptions, 'screenShareEncoding'>
} {
  const preset = PRESET_BY_TIER[tier]
  return {
    captureOptions: { resolution: preset.resolution },
    publishOptions: { screenShareEncoding: preset.encoding },
  }
}
