import { FEATURES, GITHUB_URL, HERO, LICENSE_URL, STEPS } from '$lib/landing/landing-content'
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

  it('only uses public paths for media that has been added', () => {
    const media = [HERO.media, ...FEATURES.map(feature => feature.media)]

    for (const item of media) {
      if (item.src !== undefined)
        expect(item.src.startsWith('/')).toBe(true)
    }
  })

  it('links the footer to the repository and the AGPL-3.0 text', () => {
    expect(GITHUB_URL).toMatch(/^https:\/\/github\.com\/.+\/.+/)
    expect(LICENSE_URL).toBe('https://www.gnu.org/licenses/agpl-3.0.html')
  })
})
