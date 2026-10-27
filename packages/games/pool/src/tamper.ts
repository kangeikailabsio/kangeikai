/**
 * Best-effort detection of scripts injected into the page that read the table (aim assists). A web
 * client cannot be locked down, so this only raises the cost of a copy-pasted script; anyone who
 * reads this file can bypass it.
 */

export interface Rect { left: number, top: number, right: number, bottom: number }

export interface CanvasInfo {
  rect: Rect
  position: string
  pointerEvents: string
  /** Part of the pool window itself (the game canvas), so never foreign. */
  ours: boolean
}

/** Taken at load time, before any script injected later gets a chance to replace it. */
const nativeToString = Function.prototype.toString

/** The draw and read-back methods an aim assist wraps or calls on the game's WebGL context. */
export const WATCHED_GL_METHODS = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'readPixels'] as const

/** An overlay must cover at least this share of the table to count as sitting on top of it. */
const OVERLAP_SHARE = 0.5

export function isNativeFunction(value: unknown): boolean {
  if (typeof value !== 'function')
    return false
  try {
    return /\{\s*\[native code\]\s*\}\s*$/.test(nativeToString.call(value))
  }
  catch {
    return false
  }
}

/**
 * Methods of `target` that were replaced: not native, or, with `prototypeOnly`, shadowed by an own
 * property. The latter only fits objects whose methods live on a prototype (a WebGL context); the
 * global object owns its methods, so it is checked for nativeness alone.
 */
export function replacedMethods(target: object, names: readonly string[], prototypeOnly = false): string[] {
  return names.filter(name => !isNativeFunction((target as Record<string, unknown>)[name]) || (prototypeOnly && Object.hasOwn(target, name)))
}

function area(rect: Rect): number {
  return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top)
}

function overlap(a: Rect, b: Rect): number {
  return area({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) })
}

/**
 * Canvases that are not the game's, float over the table and let clicks through — what an overlay
 * drawing on top of the game looks like. Other canvases in the page (the office behind the
 * overlay) take input or sit in the flow, so they are left alone.
 */
export function floatingOverlays(table: Rect, canvases: CanvasInfo[]): CanvasInfo[] {
  const tableArea = area(table)
  if (tableArea === 0)
    return []
  return canvases.filter(canvas => !canvas.ours
    && (canvas.position === 'fixed' || canvas.position === 'absolute')
    && canvas.pointerEvents === 'none'
    && overlap(table, canvas.rect) / tableArea >= OVERLAP_SHARE)
}

export const TAMPER_SIGNALS = ['animation-frame', 'webgl', 'overlay'] as const
export type TamperSignal = typeof TAMPER_SIGNALS[number]

/**
 * Signals needed before a player is removed from a match. The known script trips all three, while an
 * extension that touches the page usually trips one, so a single signal is never enough to punish.
 */
export const PUNISHABLE_SIGNALS = 2

export function isPunishable(signals: readonly TamperSignal[]): boolean {
  return new Set(signals).size >= PUNISHABLE_SIGNALS
}

export interface TamperProbe {
  /** `window.requestAnimationFrame` and anything else the page-level hook would replace. */
  window: object
  gl: object | null
  table: Rect
  canvases: CanvasInfo[]
}

export function detectTampering(probe: TamperProbe): TamperSignal[] {
  const signals: TamperSignal[] = []
  if (replacedMethods(probe.window, ['requestAnimationFrame']).length > 0)
    signals.push('animation-frame')
  if (probe.gl && replacedMethods(probe.gl, WATCHED_GL_METHODS, true).length > 0)
    signals.push('webgl')
  if (floatingOverlays(probe.table, probe.canvases).length > 0)
    signals.push('overlay')
  return signals
}

/** Reads the live page. `host` is the table's container, `pool` the whole pool window around it. */
export function inspectPage(host: HTMLElement, pool: HTMLElement): TamperSignal[] {
  const game = host.querySelector('canvas')
  const rect = host.getBoundingClientRect()
  const canvases = [...document.querySelectorAll('canvas')].map((canvas): CanvasInfo => {
    const style = getComputedStyle(canvas)
    const box = canvas.getBoundingClientRect()
    return { rect: box, position: style.position, pointerEvents: style.pointerEvents, ours: canvas === game || pool.contains(canvas) }
  })
  // Asking for the context the game already holds returns it; asking for another kind returns null.
  const gl = game?.getContext('webgl2') ?? game?.getContext('webgl') ?? null
  return detectTampering({ window, gl, table: rect, canvases })
}
