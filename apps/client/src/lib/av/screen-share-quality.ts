import type { ScreenShareCaptureOptions, TrackPublishOptions } from 'livekit-client'
import { VideoPreset } from 'livekit-client'

/** Issue #111 — quality tiers offered by the screen-share popover, from lightest to heaviest. */
export const SCREEN_SHARE_QUALITY_TIERS = ['720p', '1080p', '2k'] as const
export type ScreenShareQualityTier = (typeof SCREEN_SHARE_QUALITY_TIERS)[number]

export const DEFAULT_SCREEN_SHARE_QUALITY_TIER: ScreenShareQualityTier = '1080p'

export const SCREEN_SHARE_QUALITY_LABELS: Record<ScreenShareQualityTier, string> = {
  '720p': '720p',
  '1080p': '1080p (recommended)',
  '2k': '2K',
}

/**
 * Hand-built presets (#212) instead of the SDK's `ScreenSharePresets`, whose caps (1.5 / 5 Mbps,
 * and nothing above 1080p) came out far below YouTube Live's recommendations and left games
 * stuttering at the ceiling. `maxBitrate` is only a ceiling — the real bitrate still follows the
 * sharer's bandwidth estimate — but livekit-client also seeds the estimator's start bitrate at
 * 90% of it for screen share, so a sharer with less upload may see a rough first few seconds.
 * 2K has no SDK preset at all (issue #111's grill: the capture/publish options already accept
 * arbitrary resolutions/bitrates).
 */
const PRESET_BY_TIER: Record<ScreenShareQualityTier, VideoPreset> = {
  '720p': new VideoPreset(1280, 720, 15_000_000, 30, 'medium'),
  '1080p': new VideoPreset(1920, 1080, 25_000_000, 30, 'medium'),
  '2k': new VideoPreset(2560, 1440, 40_000_000, 30, 'medium'),
}

/**
 * Tiers that must hold their frame rate (#217): `maintain-framerate` makes the encoder shed
 * resolution instead of frames under CPU/bandwidth pressure (the SDK's screen-share default,
 * `maintain-resolution`, does the opposite and showed up as 15 fps in a game), and the `motion`
 * content hint tells the browser the capture is video, not text. Only 720p, the tier meant for
 * games; 1080p/2K keep the SDK defaults, which favor legibility.
 */
const KEEP_FRAMERATE_TIERS: ReadonlySet<ScreenShareQualityTier> = new Set(['720p'])

/**
 * Pure mapping from a chosen tier (+ whether to also request the shared surface's audio,
 * issue #113) to the LiveKit options `MediaControls` passes through.
 */
export function resolveScreenShareQuality(tier: ScreenShareQualityTier, shareAudio = false): {
  captureOptions: ScreenShareCaptureOptions
  publishOptions: Pick<TrackPublishOptions, 'screenShareEncoding' | 'degradationPreference'>
} {
  const preset = PRESET_BY_TIER[tier]
  const keepFramerate = KEEP_FRAMERATE_TIERS.has(tier)
  return {
    captureOptions: {
      resolution: preset.resolution,
      audio: shareAudio,
      ...(keepFramerate && { contentHint: 'motion' as const }),
    },
    publishOptions: {
      screenShareEncoding: preset.encoding,
      ...(keepFramerate && { degradationPreference: 'maintain-framerate' as const }),
    },
  }
}
