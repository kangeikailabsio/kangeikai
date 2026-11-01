import { resolveScreenShareQuality } from '$lib/av/screen-share-quality'
import { describe, expect, it } from 'vitest'

describe('resolveScreenShareQuality', () => {
  it('720p resolves to 1280x720 at 30fps (smooth enough for games)', () => {
    const { captureOptions, publishOptions } = resolveScreenShareQuality('720p')

    expect(captureOptions.resolution).toMatchObject({ width: 1280, height: 720, frameRate: 30 })
    expect(publishOptions.screenShareEncoding?.maxFramerate).toBe(30)
  })

  it('caps the bitrate at 15 / 25 / 40 Mbps for 720p / 1080p / 2k (#215)', () => {
    const cap = (tier: '720p' | '1080p' | '2k') => resolveScreenShareQuality(tier).publishOptions.screenShareEncoding?.maxBitrate

    expect(cap('720p')).toBe(15_000_000)
    expect(cap('1080p')).toBe(25_000_000)
    expect(cap('2k')).toBe(40_000_000)
  })

  it('720p keeps its frame rate under pressure: motion content hint + maintain-framerate (#217)', () => {
    const { captureOptions, publishOptions } = resolveScreenShareQuality('720p')

    expect(captureOptions.contentHint).toBe('motion')
    expect(publishOptions.degradationPreference).toBe('maintain-framerate')
  })

  it('leaves the SDK defaults (resolution over fps, no hint) for 1080p and 2k', () => {
    for (const tier of ['1080p', '2k'] as const) {
      const { captureOptions, publishOptions } = resolveScreenShareQuality(tier)

      expect(captureOptions.contentHint).toBeUndefined()
      expect(publishOptions.degradationPreference).toBeUndefined()
    }
  })

  it('1080p resolves to 1920x1080 at 30fps', () => {
    const { captureOptions, publishOptions } = resolveScreenShareQuality('1080p')

    expect(captureOptions.resolution).toMatchObject({ width: 1920, height: 1080, frameRate: 30 })
    expect(publishOptions.screenShareEncoding?.maxFramerate).toBe(30)
  })

  it('2k resolves to 2560x1440 at 30fps with a bitrate above the 1080p tier', () => {
    const { captureOptions, publishOptions } = resolveScreenShareQuality('2k')
    const oneEighty = resolveScreenShareQuality('1080p')

    expect(captureOptions.resolution).toMatchObject({ width: 2560, height: 1440, frameRate: 30 })
    expect(publishOptions.screenShareEncoding?.maxBitrate).toBeGreaterThan(oneEighty.publishOptions.screenShareEncoding?.maxBitrate ?? 0)
  })

  it('bitrate strictly increases from 720p to 1080p to 2k', () => {
    const bitrates = (['720p', '1080p', '2k'] as const).map(
      tier => resolveScreenShareQuality(tier).publishOptions.screenShareEncoding?.maxBitrate ?? 0,
    )

    expect(bitrates[0]).toBeLessThan(bitrates[1])
    expect(bitrates[1]).toBeLessThan(bitrates[2])
  })

  it('does not request audio capture by default', () => {
    const { captureOptions } = resolveScreenShareQuality('1080p')

    expect(captureOptions.audio).toBe(false)
  })

  it('requests audio capture when shareAudio is true, for every tier', () => {
    for (const tier of ['720p', '1080p', '2k'] as const) {
      expect(resolveScreenShareQuality(tier, true).captureOptions.audio).toBe(true)
    }
  })

  it('does not request audio capture when shareAudio is explicitly false', () => {
    const { captureOptions } = resolveScreenShareQuality('1080p', false)

    expect(captureOptions.audio).toBe(false)
  })
})
