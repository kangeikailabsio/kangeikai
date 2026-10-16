/**
 * Geometry for the wooden floor the table stands on. Kept free of Phaser and the DOM so the layout
 * maths stays unit-testable; `table-art.ts` does the actual painting.
 */

/**
 * The canvas clear colour, the flat band at the top of the scene, and the exact end stop of the
 *  DOM panel's gradient — the three have to agree or the seam between DOM and canvas shows.
 */
export const FLOOR_EDGE = 0x0B100E
export const FLOOR_WOOD = 0x5A4029
/**
 * Minimum horizontal gap between a seam and any seam in the row above. Staggering rows is not
 * enough on its own — with random board lengths two seams land a couple of pixels apart often
 * enough to read as a mistake, so each seam is nudged clear of the row above it.
 */
export const MIN_SEAM_OFFSET = 12

export interface Plank {
  x: number
  y: number
  width: number
  height: number
  /** Multiplier on FLOOR_WOOD, around 1, so neighbouring boards read as separate pieces. */
  shade: number
}

export interface PlankOptions {
  width: number
  height: number
  plankHeight?: number
  minLength?: number
  maxLength?: number
  random?: () => number
}

/**
 * Mulberry32. The floor is generated from a fixed seed so the plank pattern is identical every time
 * the table is opened — a floor that reshuffled itself on reopening would read as a glitch.
 */
export function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Deterministic given `random` — same injection convention as `PoolHost.random`. */
export function planks(options: PlankOptions): Plank[] {
  const { width, height, plankHeight = 34, minLength = 120, maxLength = 260, random = Math.random } = options
  const result: Plank[] = []
  const rows = Math.ceil(height / plankHeight)
  let above: number[] = []
  for (let row = 0; row < rows; row++) {
    const y = row * plankHeight
    const seams: number[] = []
    // Stagger every row by a different fraction of a board so seams never line up vertically.
    let x = -((row * 0.37 + random() * 0.2) % 1) * maxLength
    while (x < width) {
      let length = minLength + random() * (maxLength - minLength)
      // Push the seam clear of the row above. Bounded because each pass moves it strictly away.
      for (let attempt = 0; attempt < above.length + 1; attempt++) {
        const clash = above.find(seam => Math.abs(x + length - seam) < MIN_SEAM_OFFSET)
        if (clash === undefined)
          break
        length = clash - x + MIN_SEAM_OFFSET
      }
      const start = Math.max(x, 0)
      const end = Math.min(x + length, width)
      if (end > start) {
        result.push({
          x: start,
          y,
          width: end - start,
          height: Math.min(plankHeight, height - y),
          shade: 0.82 + random() * 0.36,
        })
        if (end < width)
          seams.push(end)
      }
      x += length
    }
    above = seams
  }
  return result
}

/** Scales a colour's channels by `factor`, clamped per channel, as a CSS hex string. */
export function shadeCss(color: number, factor: number): string {
  const channel = (shift: number) => {
    const value = Math.round(((color >> shift) & 0xFF) * factor)
    return Math.min(255, Math.max(0, value))
  }
  return `#${((channel(16) << 16) | (channel(8) << 8) | channel(0)).toString(16).padStart(6, '0')}`
}
