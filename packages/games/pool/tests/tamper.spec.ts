import type { CanvasInfo, Rect } from '@kangeikai/game-pool/tamper'
import { detectTampering, floatingOverlays, isNativeFunction, isPunishable, replacedMethods } from '@kangeikai/game-pool/tamper'
import { describe, expect, it } from 'vitest'

const table: Rect = { left: 100, top: 100, right: 1000, bottom: 700 }

function canvas(overrides: Partial<CanvasInfo> = {}): CanvasInfo {
  return { rect: table, position: 'fixed', pointerEvents: 'none', ours: false, ...overrides }
}

/** Stands in for a WebGL context: native methods that live on the prototype, like the real thing. */
function fakeGl(): Record<string, unknown> {
  return Object.create({ drawElements: Math.max, drawArrays: Math.max, drawElementsInstanced: Math.max, drawArraysInstanced: Math.max, readPixels: Math.max })
}

describe('native function check', () => {
  it('accepts built-ins and rejects script-defined or non-function values', () => {
    expect(isNativeFunction(Math.max)).toBe(true)
    expect(isNativeFunction(() => 1)).toBe(false)
    expect(isNativeFunction(() => {})).toBe(false)
    expect(isNativeFunction(undefined)).toBe(false)
    expect(isNativeFunction('function () { [native code] }')).toBe(false)
  })

  it('is not fooled by a script that fakes its own toString', () => {
    const wrapper = () => 1
    wrapper.toString = () => 'function () { [native code] }'
    expect(isNativeFunction(wrapper)).toBe(false)
  })

  it('treats bound built-ins as native', () => {
    expect(isNativeFunction(Math.max.bind(Math))).toBe(true)
  })
})

describe('replaced methods', () => {
  it('flags a method swapped for script code', () => {
    const target = { requestAnimationFrame: () => 0, cancelAnimationFrame: Math.max }
    expect(replacedMethods(target, ['requestAnimationFrame', 'cancelAnimationFrame'])).toEqual(['requestAnimationFrame'])
  })

  it('flags an own property shadowing a prototype method only when asked to', () => {
    const gl = fakeGl()
    Object.defineProperty(gl, 'drawArrays', { value: Math.max, configurable: true })
    expect(replacedMethods(gl, ['drawArrays'])).toEqual([])
    expect(replacedMethods(gl, ['drawArrays'], true)).toEqual(['drawArrays'])
  })
})

describe('floating overlays', () => {
  it('flags a click-through canvas covering the table', () => {
    expect(floatingOverlays(table, [canvas()])).toHaveLength(1)
    expect(floatingOverlays(table, [canvas({ position: 'absolute' })])).toHaveLength(1)
  })

  it('ignores the game canvas, canvases that take input, in-flow canvases and distant ones', () => {
    expect(floatingOverlays(table, [
      canvas({ ours: true }),
      canvas({ pointerEvents: 'auto' }),
      canvas({ position: 'static' }),
      canvas({ rect: { left: 2000, top: 0, right: 2500, bottom: 300 } }),
    ])).toEqual([])
  })

  it('needs the overlay to cover a meaningful part of the table', () => {
    expect(floatingOverlays(table, [canvas({ rect: { left: 100, top: 100, right: 200, bottom: 200 } })])).toEqual([])
    expect(floatingOverlays({ left: 0, top: 0, right: 0, bottom: 0 }, [canvas()])).toEqual([])
  })
})

describe('tamper detection', () => {
  const clean = () => ({ window: { requestAnimationFrame: Math.max }, gl: fakeGl(), table, canvases: [canvas({ ours: true })] })

  it('reports nothing on an untouched page', () => {
    expect(detectTampering(clean())).toEqual([])
    expect(detectTampering({ ...clean(), gl: null })).toEqual([])
  })

  it('reports each signal on its own', () => {
    expect(detectTampering({ ...clean(), window: { requestAnimationFrame: () => 0 } })).toEqual(['animation-frame'])
    const gl = fakeGl()
    gl.readPixels = () => 0
    expect(detectTampering({ ...clean(), gl })).toEqual(['webgl'])
    expect(detectTampering({ ...clean(), canvases: [canvas()] })).toEqual(['overlay'])
  })

  it('reports all of them for the full script', () => {
    const gl = fakeGl()
    gl.drawElements = () => 0
    expect(detectTampering({ window: { requestAnimationFrame: () => 0 }, gl, table, canvases: [canvas()] })).toEqual(['animation-frame', 'webgl', 'overlay'])
  })
})

describe('punishable signals', () => {
  it('needs two different signals, so one alone only counts as a hint', () => {
    expect(isPunishable([])).toBe(false)
    expect(isPunishable(['webgl'])).toBe(false)
    expect(isPunishable(['webgl', 'webgl'])).toBe(false)
    expect(isPunishable(['animation-frame', 'webgl'])).toBe(true)
    expect(isPunishable(['animation-frame', 'webgl', 'overlay'])).toBe(true)
  })
})
