import { existsSync } from 'node:fs'
import { FEATURES, GITHUB_URL, HERO, LICENSE_URL, mediaSources, STEPS } from '$lib/landing/landing-content'
import { describe, expect, it } from 'vitest'

describe('landing content (issue #229)', () => {
  it('gives every feature a unique id, copy and an accessible media description', () => {
    const ids = FEATURES.map(feature => feature.id)

    expect(new Set(ids).size).toBe(ids.length)
    for (const feature of FEATURES) {
      expect(feature.title.trim()).not.toBe('')
      expect(feature.description.trim()).not.toBe('')
      expect(feature.media.alt.trim()).not.toBe('')
    }
  })

  it('has a headline, a hero media slot and the three steps', () => {
    expect(HERO.headline.trim()).not.toBe('')
    expect(HERO.media.alt.trim()).not.toBe('')
    expect(STEPS).toHaveLength(3)
  })

  it('resolves a clip name to its MP4, WebM and poster under /landing', () => {
    expect(mediaSources('hero')).toEqual({
      mp4: '/landing/hero.mp4',
      webm: '/landing/hero.webm',
      poster: '/landing/hero-poster.jpg',
    })
  })

  it('has every clip it names in static/landing, in all three files (issue #242)', () => {
    const clips = [HERO.media, ...FEATURES.map(feature => feature.media)].flatMap(media => (media.clip ? [media.clip] : []))

    expect(clips.length).toBeGreaterThan(0)
    for (const clip of clips) {
      for (const path of Object.values(mediaSources(clip)))
        expect(existsSync(new URL(`../../static${path}`, import.meta.url)), path).toBe(true)
    }
  })

  it('gives each clip to one place only', () => {
    const clips = [HERO.media, ...FEATURES.map(feature => feature.media)].flatMap(media => (media.clip ? [media.clip] : []))

    expect(new Set(clips).size).toBe(clips.length)
  })

  it('links the footer to the repository and the AGPL-3.0 text', () => {
    expect(GITHUB_URL).toMatch(/^https:\/\/github\.com\/.+\/.+/)
    expect(LICENSE_URL).toBe('https://www.gnu.org/licenses/agpl-3.0.html')
  })
})
