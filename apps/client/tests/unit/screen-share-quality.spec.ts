import { resolveScreenShareQuality } from '$lib/av/screen-share-quality'
import { describe, expect, it } from 'vitest'

describe('resolveScreenShareQuality', () => {
  it('720p resolves to 1280x720 at 15fps (light preset, favors fps savings over resolution)', () => {
    const { captureOptions, publishOptions } = resolveScreenShareQuality('720p')

    expect(captureOptions.resolution).toMatchObject({ width: 1280, height: 720, frameRate: 15 })
    expect(publishOptions.screenShareEncoding?.maxFramerate).toBe(15)
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
