import { clampedCameraCenter, clampZoom, fitToMapZoom } from '$lib/game/camera/camera-math'
import { describe, expect, it } from 'vitest'

describe('clampedCameraCenter', () => {
  it('centers on the avatar when the map is larger than the viewport', () => {
    expect(clampedCameraCenter(500, 200, 1000)).toBe(500)
  })

  it('clamps so the view never shows area before the map start', () => {
    expect(clampedCameraCenter(10, 200, 1000)).toBe(100)
  })

  it('clamps so the view never shows area past the map end', () => {
    expect(clampedCameraCenter(990, 200, 1000)).toBe(900)
  })

  it('statically centers on the map center when the viewport is larger than the map', () => {
    expect(clampedCameraCenter(50, 1000, 400)).toBe(200)
  })

  it('statically centers on the map center when the viewport exactly matches the map size', () => {
    expect(clampedCameraCenter(50, 400, 400)).toBe(200)
  })
})

describe('fitToMapZoom', () => {
  it('is constrained by the narrower axis when the map is wider than it is tall relative to the viewport', () => {
    expect(fitToMapZoom(800, 600, 1600, 800)).toBe(0.5)
  })

  it('is constrained by the narrower axis when the map is taller than it is wide relative to the viewport', () => {
    expect(fitToMapZoom(800, 600, 800, 1500)).toBe(0.4)
  })

  it('can exceed 1 when the map is smaller than the viewport', () => {
    expect(fitToMapZoom(2000, 2000, 500, 500)).toBe(4)
  })
})

describe('clampZoom', () => {
  it('passes values already within range through unchanged', () => {
    expect(clampZoom(1.5, 0.5, 2)).toBe(1.5)
  })

  it('clamps below the minimum', () => {
    expect(clampZoom(0.1, 0.5, 2)).toBe(0.5)
  })

  it('clamps above the maximum', () => {
    expect(clampZoom(5, 0.5, 2)).toBe(2)
  })
})
